package ph.vaind.app;

import java.net.URI;
import java.util.Locale;

/** No user-selected hosts, credentials, HTTP or uploads. Redirects use the same policy. */
public final class ReportPolicy {
 private ReportPolicy(){}
 public static String normalize(String value){
  try{
   URI uri=new URI(value);String host=uri.getHost();
   if(value.length()>2048||!"https".equals(uri.getScheme())||host==null||uri.getRawUserInfo()!=null||uri.getRawFragment()!=null||(uri.getPort()!=-1&&uri.getPort()!=443))throw new IllegalArgumentException();
   host=host.toLowerCase(Locale.ROOT);
   if(!host.equals("cebudailynews.inquirer.net")&&!host.equals("da.gov.ph")&&!host.endsWith(".da.gov.ph")&&!host.equals("www.gmanetwork.com"))throw new IllegalArgumentException();
   return uri.toASCIIString();
  }catch(Exception error){throw new IllegalArgumentException("Untrusted price report");}
 }
 public static boolean supportedType(String type){
  if(type==null)return false;String mime=type.split(";",2)[0].trim().toLowerCase(Locale.ROOT);
  return mime.equals("text/html")||mime.equals("text/plain")||mime.equals("text/csv")||mime.equals("application/csv")||mime.equals("application/xhtml+xml");
 }
}
