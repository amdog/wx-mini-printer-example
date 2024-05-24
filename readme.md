# 通过微信小程序连接蓝牙打印机实现文字 图片打印示例 ESC/POS指令

## 我踩了好多坑出来的 希望对后面的同学有帮助 

- 代码在 https://github.com/amdog/wx-mini-printer-example

## 主要的坑
1、连接打印机，这个是我按照网上大佬的示例做的，基本一遍过，设备重连这个很重要 小程序切换到后台再打开要重连设备。

2、打印图片， 最坑的就是这个了，原来打算用canvas api 将图片渲染上去再取出来imagedata ，最后发现
要么有的手机有兼容问题，wxml-to-canvas不支持。shi一样的小程序api，渲染到canvas的图片会错位，什么dpr，手机像素密度咯各种问题要解决取出来的imagedata和渲染上去的不一致
所以我干脆用后端直接把imagedata从服务端发到客户端上，真解决了兼容问题。如果数据包大的话还可压缩的：比如把图片先做黑白化处理255压缩为1，alpha通道不要传，毕竟都一样打印机不会打印透明，打印机只要黑和白。

3、java获取生成二维码并且获取图片imagedata示例
```java
       @GetMapping ("/makeQrcodeImageDataJSONArray")
              @Anonymous
              public JSONArray makeQrcodeImageDataJSONArray(@RequestParam(required = true) String url,
                                                            @RequestParam(required = false) int width,
                                                            @RequestParam(required = false) int height) throws IOException {
                  try{
                      Map<EncodeHintType, Object> hints = new HashMap<>();
                      hints.put(EncodeHintType.CHARACTER_SET, "UTF-8");
                      BitMatrix bitMatrix = new QRCodeWriter().encode(url, BarcodeFormat.QR_CODE, width, height, hints);
                      // 将 BitMatrix 转换为 BufferedImage
                      BufferedImage image = MatrixToImageWriter.toBufferedImage(bitMatrix);
                      // 获取图像的宽度和高度
                      int imageWidth = image.getWidth();
                      int imageHeight = image.getHeight();
                      // 遍历图像的所有像素点，并获取它们的 RGBA 值
                      List<Object> rgbaValues = new ArrayList<>();
                      for (int y = 0; y < imageHeight; y++) {
                          for (int x = 0; x < imageWidth; x++) {
                              int rgb = image.getRGB(x, y);
                              int alpha = (rgb >> 24) & 0xFF; // 获取 alpha 值
                              int red = (rgb >> 16) & 0xFF;
                              int green = (rgb >> 8) & 0xFF;
                              int blue = rgb & 0xFF;
                              rgbaValues.add(red);
                              rgbaValues.add(green);
                              rgbaValues.add(blue);
                              rgbaValues.add(alpha);
                          }
                      }
                      return new JSONArray(rgbaValues);
                  }catch(Exception e){
                      return  new JSONArray();
                  }
              }
```
