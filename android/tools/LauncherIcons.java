import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.File;
import javax.imageio.ImageIO;

/** Resize the owner's logo without changing its artwork. Run with a desktop JDK. */
public class LauncherIcons {
 public static void main(String[] args)throws Exception{
  BufferedImage source=ImageIO.read(new File(args[0]));
  String[] names={"mdpi","hdpi","xhdpi","xxhdpi","xxxhdpi"};int[] sizes={48,72,96,144,192};
  for(int i=0;i<sizes.length;i++){
   BufferedImage icon=new BufferedImage(sizes[i],sizes[i],BufferedImage.TYPE_INT_ARGB);
   var graphics=icon.createGraphics();graphics.setRenderingHint(RenderingHints.KEY_INTERPOLATION,RenderingHints.VALUE_INTERPOLATION_BICUBIC);graphics.drawImage(source,0,0,sizes[i],sizes[i],null);graphics.dispose();
   File target=new File(args[1]+"/mipmap-"+names[i]+"/ic_launcher.png");target.getParentFile().mkdirs();ImageIO.write(icon,"png",target);
  }
 }
}
