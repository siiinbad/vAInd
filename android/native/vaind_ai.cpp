#include "llama.h"
#include <algorithm>
#include <atomic>
#include <chrono>
#include <cmath>
#include <fstream>
#include <iostream>
#include <memory>
#include <mutex>
#include <stdexcept>
#include <string>
#include <vector>
#ifdef __ANDROID__
#include <jni.h>
#endif

namespace {
std::atomic<bool> cancelled{false};
std::once_flag initialized;
struct Deadline { std::chrono::steady_clock::time_point end; };
bool abort_inference(void * state){return cancelled.load()||std::chrono::steady_clock::now()>static_cast<Deadline*>(state)->end;}
std::vector<llama_token> tokenize(const llama_vocab * vocab,const std::string & text,bool special){
 int size=llama_tokenize(vocab,text.data(),static_cast<int>(text.size()),nullptr,0,special,special);
 if(size>=0)throw std::runtime_error("tokenize");
 std::vector<llama_token> tokens(-size);
 int actual=llama_tokenize(vocab,text.data(),static_cast<int>(text.size()),tokens.data(),tokens.size(),special,special);
 if(actual<=0)throw std::runtime_error("tokenize");tokens.resize(actual);return tokens;
}
int select_plan(const std::string & path,const std::string & prompt,int count,int threads){
 if(prompt.empty()||prompt.size()>16000||count<2||count>4)throw std::runtime_error("input");
 std::call_once(initialized,[]{llama_backend_init();});
 Deadline deadline{std::chrono::steady_clock::now()+std::chrono::seconds(120)};
 auto parameters=llama_model_default_params();parameters.n_gpu_layers=0;parameters.load_mode=LLAMA_LOAD_MODE_MMAP;
 parameters.progress_callback=[](float,void * state){return !abort_inference(state);};parameters.progress_callback_user_data=&deadline;
 std::unique_ptr<llama_model,decltype(&llama_model_free)> model(llama_model_load_from_file(path.c_str(),parameters),llama_model_free);
 if(!model||abort_inference(&deadline))throw std::runtime_error("model");
 auto vocab=llama_model_get_vocab(model.get());
 const std::string system="You select a monthly Filipino meal plan. Read the household data, compare the complete validated options, and output only the best option letter: A, B, C or D.";
 llama_chat_message messages[]={{"system",system.c_str()},{"user",prompt.c_str()}};
 const char * format=llama_model_chat_template(model.get(),nullptr);
 int size=llama_chat_apply_template(format,messages,2,true,nullptr,0);
 if(size<=0||size>30000)throw std::runtime_error("template");
 std::vector<char> formatted(size+1);
 int actual=llama_chat_apply_template(format,messages,2,true,formatted.data(),formatted.size());
 if(actual<=0||actual>size)throw std::runtime_error("template");
 auto tokens=tokenize(vocab,std::string(formatted.data(),actual),true);
 if(tokens.size()>2000)throw std::runtime_error("context");
 auto config=llama_context_default_params();config.n_ctx=2048;config.n_batch=128;config.n_ubatch=128;
 config.n_threads=std::clamp(threads,1,4);config.n_threads_batch=config.n_threads;config.abort_callback=abort_inference;config.abort_callback_data=&deadline;
 std::unique_ptr<llama_context,decltype(&llama_free)> context(llama_init_from_model(model.get(),config),llama_free);
 if(!context)throw std::runtime_error("context");
 for(size_t start=0;start<tokens.size();start+=128){
  if(abort_inference(&deadline))throw std::runtime_error("cancelled");
  int length=std::min<size_t>(128,tokens.size()-start);
  auto batch=llama_batch_get_one(tokens.data()+start,length);
  if(llama_decode(context.get(),batch)!=0)throw std::runtime_error("decode");
 }
 const float * logits=llama_get_logits_ith(context.get(),-1);if(!logits)throw std::runtime_error("logits");
 // Constrained one-token classification: an LLM decision, with no generated prices or text.
 int choice=-1;float best=-INFINITY;
 for(int i=0;i<count;i++){
  auto label=tokenize(vocab,std::string(1,static_cast<char>('A'+i)),false);
  if(label.size()!=1)throw std::runtime_error("label");
  float value=logits[label[0]];if(std::isfinite(value)&&value>best){best=value;choice=i;}
 }
 if(choice<0||abort_inference(&deadline))throw std::runtime_error("choice");return choice;
}
}
#ifdef __ANDROID__
extern "C" JNIEXPORT void JNICALL Java_ph_vaind_app_NativeAi_reset(JNIEnv*,jclass){cancelled=false;}
extern "C" JNIEXPORT void JNICALL Java_ph_vaind_app_NativeAi_cancel(JNIEnv*,jclass){cancelled=true;}
extern "C" JNIEXPORT jint JNICALL Java_ph_vaind_app_NativeAi_select(JNIEnv* env,jclass,jstring model,jstring prompt,jint count,jint threads){
 const char * path=env->GetStringUTFChars(model,nullptr);const char * text=env->GetStringUTFChars(prompt,nullptr);
 if(!path||!text){if(path)env->ReleaseStringUTFChars(model,path);if(text)env->ReleaseStringUTFChars(prompt,text);return -1;}
 int result=-1;try{result=select_plan(path,text,count,threads);}catch(const std::exception &){result=-1;}catch(...){result=-1;}
 env->ReleaseStringUTFChars(model,path);env->ReleaseStringUTFChars(prompt,text);return result;
}
#else
int main(int argc,char ** argv){
 if(argc!=4){std::cerr<<"Usage: vaind-ai-check model.gguf prompt.txt option-count\n";return 2;}
 try{std::ifstream file(argv[2]);std::string prompt((std::istreambuf_iterator<char>(file)),{});int result=select_plan(argv[1],prompt,std::stoi(argv[3]),4);std::cout<<"{\"choice\":"<<result<<"}\n";return 0;}catch(const std::exception & e){std::cerr<<"Inference unavailable: "<<e.what()<<"\n";return 1;}
}
#endif
