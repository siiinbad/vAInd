package ph.vaind.app;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.*;
import android.widget.*;
import org.json.JSONObject;
import java.io.*;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;

/** A bundled offline app. Remote pages never receive the native bridge. */
public final class MainActivity extends Activity {
 private static final String ORIGIN="https://appassets.androidplatform.net";
 private static final int SAVE=40,OPEN=41,LIMIT=12_000_000;
 private WebView web;
 private final ThreadPoolExecutor workers=new ThreadPoolExecutor(3,3,30,TimeUnit.SECONDS,new ArrayBlockingQueue<>(24));
 private final ConcurrentHashMap<String,HttpURLConnection> connections=new ConcurrentHashMap<>();
 private final Set<String> cancelled=ConcurrentHashMap.newKeySet();
 private ValueCallback<Uri[]> fileCallback;
 private String savingId,savingBody;
 private boolean ready;
 private NativeAi nativeAi;

 @Override public void onCreate(Bundle state){
  super.onCreate(state);nativeAi=new NativeAi(this);
  try{
   web=new WebView(this);web.setBackgroundColor(Color.rgb(248,248,243));
   FrameLayout root=new FrameLayout(this);root.addView(web);setContentView(root);
   root.setOnApplyWindowInsetsListener((v,insets)->{android.graphics.Insets bars=insets.getInsets(WindowInsets.Type.systemBars()|WindowInsets.Type.displayCutout()|WindowInsets.Type.ime());v.setPadding(bars.left,bars.top,bars.right,bars.bottom);return insets;});
   // Android 8–10 use the older inset API; Android 11+ uses getInsets above.
   if(android.os.Build.VERSION.SDK_INT<30)root.setOnApplyWindowInsetsListener((v,insets)->{v.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());return insets;});
   WebSettings settings=web.getSettings();settings.setJavaScriptEnabled(true);settings.setDomStorageEnabled(true);
   settings.setAllowFileAccess(false);settings.setAllowContentAccess(false);settings.setJavaScriptCanOpenWindowsAutomatically(false);
   settings.setSupportMultipleWindows(false);settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
   settings.setMediaPlaybackRequiresUserGesture(true);WebView.setWebContentsDebuggingEnabled(false);
   CookieManager.getInstance().setAcceptCookie(false);
   web.addJavascriptInterface(new Bridge(),"VaindAndroid");
   web.setWebChromeClient(new WebChromeClient(){
    @Override public boolean onShowFileChooser(WebView view,ValueCallback<Uri[]> callback,FileChooserParams params){
     if(fileCallback!=null)fileCallback.onReceiveValue(null);fileCallback=callback;
     try{Intent intent=new Intent(Intent.ACTION_OPEN_DOCUMENT);intent.addCategory(Intent.CATEGORY_OPENABLE);intent.setType("application/json");intent.putExtra(Intent.EXTRA_TITLE,getString(R.string.open_file));startActivityForResult(intent,OPEN);}catch(Exception error){callback.onReceiveValue(null);fileCallback=null;}
     return true;
    }
   });
   web.setWebViewClient(new WebViewClient(){
    @Override public void onPageStarted(WebView view,String url,android.graphics.Bitmap icon){ready=url.startsWith(ORIGIN+"/");}
    @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest request){return asset(request);}
    @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){
     Uri uri=request.getUrl();if(local(uri)&&("/".equals(uri.getPath())||"/index.html".equals(uri.getPath())))return false;
     if(request.isForMainFrame()&&("https".equals(uri.getScheme())||"http".equals(uri.getScheme()))&&!local(uri))runOnUiThread(()->openExternal(uri));
     return true;
    }
    @Override public void onPageFinished(WebView view,String url){
     ready=url.startsWith(ORIGIN+"/");
     if(ready)view.evaluateJavascript("Boolean(Object.hasOwn && String.prototype.replaceAll && globalThis.structuredClone && globalThis.AbortSignal?.timeout)",value->{if(!"true".equals(value))showError(R.string.webview_required);});
    }
    @Override public void onReceivedError(WebView view,WebResourceRequest request,WebResourceError error){if(request.isForMainFrame())showError(R.string.load_error);}
    @Override public boolean onRenderProcessGone(WebView view,RenderProcessGoneDetail detail){ready=false;view.destroy();showError(R.string.load_error);return true;}
   });
   web.loadUrl(ORIGIN+"/");
   if(android.os.Build.VERSION.SDK_INT>=33)getOnBackInvokedDispatcher().registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT,this::handleBack);
  }catch(Exception error){showError(R.string.load_error);}
 }
 private boolean local(Uri uri){return "https".equals(uri.getScheme())&&"appassets.androidplatform.net".equals(uri.getHost())&&uri.getPort()==-1&&uri.getUserInfo()==null;}
 private WebResourceResponse asset(WebResourceRequest request){
  Uri uri=request.getUrl();
  if(!local(uri)||!"GET".equals(request.getMethod()))return response("text/plain",403,"Blocked");
  String path=uri.getPath();if(path==null)return response("text/plain",404,"Unavailable");
  if(path.equals("/"))path="/index.html";
  if(path.contains("..")||path.contains("\\")||!path.matches("/[A-Za-z0-9_./-]+")||path.startsWith("/api/")||path.equals("/sw.js"))return response("text/plain",404,"Unavailable");
  String mime=path.endsWith(".html")?"text/html":path.endsWith(".js")?"text/javascript":path.endsWith(".css")?"text/css":path.endsWith(".png")?"image/png":path.endsWith(".svg")?"image/svg+xml":path.endsWith(".webmanifest")?"application/manifest+json":"application/json";
  try{return new WebResourceResponse(mime,"UTF-8",200,"OK",headers(),getAssets().open("web"+path));}catch(IOException error){return response("text/plain",404,"Unavailable");}
 }
 private Map<String,String> headers(){Map<String,String> h=new HashMap<>();h.put("Content-Security-Policy","default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'self'");h.put("X-Content-Type-Options","nosniff");h.put("Cache-Control","no-store");return h;}
 private WebResourceResponse response(String mime,int status,String value){return new WebResourceResponse(mime,"UTF-8",status,status==403?"Forbidden":"Not Found",headers(),new ByteArrayInputStream(value.getBytes(StandardCharsets.UTF_8)));}
 private void openExternal(Uri uri){try{startActivity(new Intent(Intent.ACTION_VIEW,uri).addCategory(Intent.CATEGORY_BROWSABLE));}catch(Exception error){Toast.makeText(this,R.string.external_error,Toast.LENGTH_LONG).show();}}
 private void showError(int message){runOnUiThread(()->{ready=false;LinearLayout layout=new LinearLayout(this);layout.setOrientation(LinearLayout.VERTICAL);layout.setPadding(40,60,40,40);TextView text=new TextView(this);text.setText(message);text.setTextSize(19);layout.addView(text);Button retry=new Button(this);retry.setText(R.string.retry);retry.setOnClickListener(v->recreate());layout.addView(retry);setContentView(layout);});}
 private JSONObject error(String message){JSONObject result=new JSONObject();try{result.put("error",message);}catch(Exception ignored){}return result;}
 private void finish(String id,JSONObject result){
  connections.remove(id);if(cancelled.remove(id))return;
  runOnUiThread(()->{if(ready&&!isFinishing()&&!isDestroyed())web.evaluateJavascript("globalThis.vaindNativeComplete?.("+JSONObject.quote(id)+","+result.toString()+")",null);});
 }
 public final class Bridge {
  @JavascriptInterface public void cancel(String id){if(id!=null&&id.matches("[A-Za-z0-9_-]{1,80}")){cancelled.add(id);nativeAi.cancelRequest(id);HttpURLConnection connection=connections.remove(id);if(connection!=null)connection.disconnect();}}
  @JavascriptInterface public void request(String encoded){
   String id="";
   try{
    if(encoded.length()>LIMIT)throw new IllegalArgumentException();JSONObject request=new JSONObject(encoded);id=request.getString("id");if(!id.matches("[A-Za-z0-9_-]{1,80}"))return;
    final String requestId=id;
    if(request.optString("kind").equals("ai")){nativeAi.request(requestId,request,MainActivity.this::finish);return;}
    if(request.optString("kind").equals("save")){runOnUiThread(()->saveDocument(requestId,request));return;}
    if(!request.optString("kind").equals("report"))throw new IllegalArgumentException();
    final String url=ReportPolicy.normalize(request.getString("url"));
    workers.execute(()->{if(cancelled.remove(requestId))return;try{finish(requestId,report(url,requestId));}catch(Exception error){finish(requestId,error("loadPricesError"));}});
   }catch(Exception error){if(!id.isEmpty())finish(id,error("sharedUnavailable"));}
  }
 }
 private JSONObject report(String url,String id)throws Exception{
  for(int redirect=0;redirect<=3;redirect++){
   if(cancelled.contains(id)||Thread.currentThread().isInterrupted())throw new IOException("cancelled");
   url=ReportPolicy.normalize(url);
   HttpURLConnection connection=(HttpURLConnection)new URL(url).openConnection();connections.put(id,connection);
   connection.setConnectTimeout(8000);connection.setReadTimeout(20000);connection.setInstanceFollowRedirects(false);connection.setRequestMethod("GET");
   connection.setRequestProperty("Accept","text/html,text/plain,text/csv,application/csv");
   connection.setRequestProperty("User-Agent","vAInd Android price reader/1.2 (personal household planning)");
   try{
    int status=connection.getResponseCode();
    if(status>=300&&status<400){String location=connection.getHeaderField("Location");if(location==null)throw new IOException("redirect");url=ReportPolicy.normalize(new URL(new URL(url),location).toString());continue;}
    if(status!=200||!ReportPolicy.supportedType(connection.getContentType())||connection.getContentLengthLong()>6_000_000)throw new IOException("response");
    String text;try(InputStream in=connection.getInputStream()){text=read(in,6_000_000);}
    JSONObject result=new JSONObject();result.put("text",text);result.put("url",url);return result;
   }finally{connection.disconnect();connections.remove(id);}
  }
  throw new IOException("redirect limit");
 }
 private String read(InputStream in,int limit)throws IOException{
  if(in==null)throw new IOException("empty");ByteArrayOutputStream out=new ByteArrayOutputStream();byte[] bytes=new byte[8192];int count;
  while((count=in.read(bytes))!=-1){if(out.size()+count>limit)throw new IOException("large");out.write(bytes,0,count);}return out.toString("UTF-8");
 }
 private void saveDocument(String id,JSONObject request){
  try{
   if(savingId!=null)throw new IOException();String name=request.getString("name"),type=request.getString("type"),body=request.getString("body");
   if(!name.matches("vaind-[A-Za-z0-9-]+\\.(json|csv)")||body.getBytes(StandardCharsets.UTF_8).length>10_000_000||!(type.equals("application/json")||type.equals("text/csv;charset=utf-8")))throw new IOException();
   Intent intent=new Intent(Intent.ACTION_CREATE_DOCUMENT);intent.addCategory(Intent.CATEGORY_OPENABLE);intent.setType(type.startsWith("text/csv")?"text/csv":"application/json");intent.putExtra(Intent.EXTRA_TITLE,name);
   savingId=id;savingBody=body;startActivityForResult(intent,SAVE);
  }catch(Exception error){if(id.equals(savingId)){savingId=null;savingBody=null;}finish(id,error("storageUnavailable"));}
 }
 @Override protected void onActivityResult(int request,int result,Intent data){
  super.onActivityResult(request,result,data);
  if(request==OPEN&&fileCallback!=null){fileCallback.onReceiveValue(result==RESULT_OK&&data!=null&&data.getData()!=null?new Uri[]{data.getData()}:null);fileCallback=null;}
  if(request==SAVE&&savingId!=null){String id=savingId,body=savingBody;savingId=null;savingBody=null;
   if(result!=RESULT_OK||data==null||data.getData()==null){JSONObject response=new JSONObject();try{response.put("cancelled",true);}catch(Exception ignored){}finish(id,response);return;}
   Uri destination=data.getData();try{workers.execute(()->{try(OutputStream out=getContentResolver().openOutputStream(destination,"wt")){if(out==null)throw new IOException();out.write(body.getBytes(StandardCharsets.UTF_8));finish(id,new JSONObject());}catch(Exception error){finish(id,error("storageUnavailable"));}});}catch(Exception error){finish(id,error("storageUnavailable"));}
  }
 }
 @Override public void onBackPressed(){handleBack();}
 private void handleBack(){
  if(!ready){finish();return;}
  web.evaluateJavascript("Boolean(document.querySelector('dialog[open]'))",result->{if("true".equals(result))web.evaluateJavascript("document.querySelector('dialog[open]')?.close()",null);else if(web.canGoBack())web.goBack();else finish();});
 }
 @Override protected void onDestroy(){ready=false;if(nativeAi!=null)nativeAi.close();if(fileCallback!=null)fileCallback.onReceiveValue(null);for(HttpURLConnection c:connections.values())c.disconnect();workers.shutdownNow();if(web!=null){web.removeJavascriptInterface("VaindAndroid");web.destroy();}super.onDestroy();}
}
