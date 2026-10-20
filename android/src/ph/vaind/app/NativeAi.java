package ph.vaind.app;

import android.app.ActivityManager;
import android.content.Context;
import android.os.StatFs;
import java.io.*;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;
import org.json.JSONObject;

/** Owns the embedded model on one worker; no network calls or API keys. */
public final class NativeAi implements AutoCloseable {
 public static final String SHA256="74a4da8c9fdbcd15bd1f6d01d621410d31c6fc00986f5eb687824e7b93d7a9db";
 public static final long SIZE=491400032L;
 private final Context context;
 private final ExecutorService worker=Executors.newSingleThreadExecutor();
 private final AtomicBoolean busy=new AtomicBoolean(false),stopped=new AtomicBoolean(false);
 private volatile String activeId;
 private volatile boolean loaded;
 public interface Callback {void complete(String id,JSONObject result);}
 public NativeAi(Context context){this.context=context.getApplicationContext();}
 private static native void reset();
 private static native void cancel();
 private static native int select(String path,String prompt,int count,int threads);
 private JSONObject error(String code){JSONObject value=new JSONObject();try{value.put("error",code);}catch(Exception ignored){}return value;}
 public void request(String id,JSONObject request,Callback callback){
  if(stopped.get()||!busy.compareAndSet(false,true)){callback.complete(id,error("deviceAiUnavailable"));return;}
  activeId=id;
  try{worker.execute(()->{
   try{
    String prompt=request.getString("prompt");int count=request.getInt("count");
    if(prompt.isEmpty()||prompt.length()>16000||count<2||count>4)throw new IOException("deviceAiUnavailable");
    if(!loaded){try{System.loadLibrary("vaind_ai");loaded=true;}catch(UnsatisfiedLinkError failure){throw new IOException("deviceAiUnsupported");}}
    reset();if(stopped.get()||!id.equals(activeId))throw new IOException("deviceAiUnavailable");
    ActivityManager.MemoryInfo memory=new ActivityManager.MemoryInfo();((ActivityManager)context.getSystemService(Context.ACTIVITY_SERVICE)).getMemoryInfo(memory);
    if(memory.lowMemory||memory.availMem<1100L*1024*1024)throw new IOException("deviceAiMemory");
    File model=prepareModel(id);
    if(stopped.get()||!id.equals(activeId))throw new IOException("deviceAiUnavailable");
    int choice=select(model.getAbsolutePath(),prompt,count,Runtime.getRuntime().availableProcessors());
    if(choice<0||choice>=count)throw new IOException("deviceAiUnavailable");
    JSONObject response=new JSONObject();response.put("choice",choice);callback.complete(id,response);
   }catch(OutOfMemoryError failure){callback.complete(id,error("deviceAiMemory"));}
   catch(Exception failure){String code=failure.getMessage();callback.complete(id,error("deviceAiMemory".equals(code)||"deviceAiStorage".equals(code)||"deviceAiUnsupported".equals(code)?code:"deviceAiUnavailable"));}
   finally{activeId=null;busy.set(false);}
  });}catch(RejectedExecutionException failure){activeId=null;busy.set(false);callback.complete(id,error("deviceAiUnavailable"));}
 }
 private File prepareModel(String id)throws Exception{
  File directory=new File(context.getFilesDir(),"ai");if(!directory.exists()&&!directory.mkdirs())throw new IOException("deviceAiStorage");
  File model=new File(directory,"qwen2.5-0.5b-q4_k_m.gguf"),marker=new File(directory,"verified.sha256");
  if(model.length()==SIZE&&marker.isFile()&&new String(Files.readAllBytes(marker.toPath()),java.nio.charset.StandardCharsets.UTF_8).equals(SHA256))return model;
  if(new StatFs(directory.getPath()).getAvailableBytes()<SIZE+128L*1024*1024)throw new IOException("deviceAiStorage");
  File temporary=new File(directory,"model.tmp");
  try{
   MessageDigest digest=MessageDigest.getInstance("SHA-256");long bytes=0;
   try(InputStream in=context.getAssets().open("ai/model.gguf");FileOutputStream out=new FileOutputStream(temporary)){
    byte[] buffer=new byte[1024*1024];int count;
    while((count=in.read(buffer))!=-1){if(stopped.get()||!id.equals(activeId))throw new IOException("cancelled");bytes+=count;if(bytes>SIZE)throw new IOException("model");digest.update(buffer,0,count);out.write(buffer,0,count);}out.getFD().sync();
   }
   StringBuilder hash=new StringBuilder();for(byte value:digest.digest())hash.append(String.format(java.util.Locale.ROOT,"%02x",value&255));
   if(bytes!=SIZE||!hash.toString().equals(SHA256))throw new IOException("model");
   Files.move(temporary.toPath(),model.toPath(),StandardCopyOption.ATOMIC_MOVE,StandardCopyOption.REPLACE_EXISTING);
   Files.write(marker.toPath(),SHA256.getBytes(java.nio.charset.StandardCharsets.UTF_8));return model;
  }finally{if(temporary.exists())temporary.delete();}
 }
 public void cancelRequest(String id){if(id.equals(activeId)){activeId=null;if(loaded)cancel();}}
 @Override public void close(){stopped.set(true);activeId=null;if(loaded)cancel();worker.shutdownNow();}
}
