// index.js
// 获取应用实例\


import Dialog from '@vant/weapp/dialog/dialog';
import Notify from '@vant/weapp/notify/notify';
import util from '../../utils/util.js';
// const imgd=require('./imgd.js')

const printerJobs = require("../../printer/printerjobs")
const printerUtil = require("../../printer/printerutil")
const toArrayBuffer = require("to-array-buffer")
const {
  Buffer
} = require("buffer")

let jobIdx = 0

const app = getApp()
let readyJobs=[]

let firstOpenLoad = true
Page({
  data: {
    dpr:1,
    // 打印图片配置
    printerImageConfig:{
      width:200,
      height:200,
    },
    // 是否连接
    isConnect: false,
    // 小程序版本
    version: "",
    // 设备列表
    deviceList: [
      //   {
      //   name: "MP00",
      //   deviceId: "86:67:7A:66:88:81",
      //   RSSI: -99
      // }
    ],
    // 连接的设备 service
    inactive: [],
    // 连接的设备id
    id: "",
    // 连接的设备id
    connectId: "",
    // 历史打印
    printDataList: [],
    // 当前选择的打印数据
    currentChosePaper: {

    },
    // 请求地址
    baseUrl: "https://amdog.github.io",
    // 是否正在打印
    isPrinting: false
  },
  onHide() {
    this.focusDisDevice(() => {

    });
  },
  onShow() {
    if (!this.data.id || (this.data.inactive.length == 0)) {
      this.queryDeviceList(true);
    }
  },

  onLoad(options) {

    // 设置小程序版本
    let miniInfo = wx.getAccountInfoSync()
    console.log(miniInfo.miniProgram.version, "小程序版本")
    this.setData({
      version: miniInfo.miniProgram.version || "未知版本"
    })

    let id = '1111111111'
    if (options && options.id) {
      id = options.id
    }
    if (id) {
      this.loadBizPaper(id)
    }

    let paperList = wx.getStorageSync("printerHistoryLocalPaper") || []
    this.setData({
      printDataList: paperList
    })

  },


  //加载短链接的打印任务
  loadBizPaper(id) {

    let that = this
    // 我用的是测试地址
    wx.request({
      url: this.data.baseUrl+"/public/test-printer-response.json?v",
      method: "get",
      success(res) {
        // 如果我的链接失效了 返回error 那就看这个目录下的test-response.json文件
        console.log("获取打印数据上下文==>", res.data)
          // 更新打印历史
          let list = that.data.printDataList
          list = list.filter(it => {
            return it && it.name != res.data.name
          })
          list.unshift(res.data)
          that.setData({
            printDataList: list
          })

          wx.setStorageSync("printerHistoryLocalPaper", list.slice(0, 20))

          that.previewPrintPaper({}, res.data)
          that.setData({
            currentChosePaper:res.data
          })





      },
      fail(err) {

        Dialog.alert({
          message: '错误码:[10001];获取打印任务失败了,' + JSON.stringify(err),
        })
        console.log(err);
      }
    })
  },
  // 预览打印单 如果没有val 那就是点击触发的
  async previewPrintPaper(event, val) {
    if (!val) {
      val = event.currentTarget.dataset.val
    };
    await new Promise(res => {
      setTimeout(() => {
        res(1)
      }, 500);
    })

    this.setData({
      currentChosePaper: val,
      showPreview: true
    })
  },

  // 切换
  closePaperPreview() {
    this.setData({
      showPreview: false
    })
  },

  // 解析指令 返回解析完成的单子 buffer
  async compileContextToBuffer() {

    // =>PRINT_TEXT_CENTER_LARGE_BOLD=打印文本 居中 大号字体 加粗字体
    // =>PRINT_TEXT_CENTER=
    // =>PRINT_IMG_BASE64_URL=打印图片地址 必须为base64 并且直接返回


    let util = {
      job: null,
      setAlign(cmd) {
        if (cmd.indexOf("CENTER") > -1) {
          return this.job.setAlign("CT")
        }
        if (cmd.indexOf("LEFT") > -1) {
          return this.job.setAlign("LT")
        }
        if (cmd.indexOf("RIGHT") > -1) {
          return this.job.setAlign("RT")
        }
        return this.job.setAlign("CT")
      },
      setSize(cmd) {
        if (cmd.indexOf("LARGE") > -1) {
          return this.job.setSize(2, 2)
        }
        return this.job.setSize(1, 1)
      },
      setBold(cmd) {
        if (cmd.indexOf("BOLD") > -1) {
          return this.job.setBold(true)
        }
        return this.job.setBold(false)
      },


    }
    
    // 在这里拿到我的打印逻辑指令
    let template =this.data.currentChosePaper.ext_print_template

    // 去除空行
    let templates = template.split("\n")
      // 解析为对象
      .map(v => {
        let cmds = v.match(/=>([\s\S]*?)->/g);
        return {
          cmds: (cmds || [])[0],
          content: v.split(cmds || "")[1]
        }
      }).filter(v => {
        return v.cmds;
      })
    console.log("解析后指令=>", templates)

    for (const val of templates) {
      // 这是文字打印
      if (val.cmds.indexOf("TEXT") > -1) {
        console.log("文字打印指令",val)
        util.job = new printerJobs();
        util.setSize(val.cmds)
        util.setAlign(val.cmds)
        util.setBold(val.cmds)
        util.job.print(printerUtil.fillAround(val.content, ""))
        let textBuffer=util.job.buffer();
        for (let i = 0; i < textBuffer.byteLength; i = i + 20) { //限制输入数据
          // 把解析到一行的指令写到任务里面
          readyJobs.push(textBuffer.slice(i, i + 20));
        }
      }
      // 这是图片打印
      if (val.cmds.indexOf("PRINT_IMAGE_DATA_URL") > -1) {
        console.log("读取到打印base64图片" + val.content)
        // 使用正则表达式解析高度和宽度
        const regex = /H(\d+)_W(\d+)/;
        const match = val.cmds.match(regex);

        let height = 200; // 高度
        let width = 200; // 宽度

        if (match) {
          height = parseInt(match[1]) ; // 高度
          width = parseInt(match[2]); // 宽度
        }

        // 把宽高丢给全局
        let config=this.data.printerImageConfig
        config.width=width
        config.height=height

        this.setData({
          printerImageConfig:config
        })


        // 这这里就重要了 获取图片的imagedata 对象 
        // imagedata 就是图片的rgba序列 四个代表一个像素 例如[244,211,23,255,r.....g.....b.....a]
        let imageDataArr = await this.loadImageData(val.content)
        // 等待打印图片


        // 获取图片居中方式
        let align="RIGHT"
        // 
        if(val.cmds.indexOf("RIGHT") > -1){
          align="RIGHT"
        }
        if(val.cmds.indexOf("LEFT") > -1){
          align="LEFT"
        }
        if(val.cmds.indexOf("CENTER") > -1){
          align="CENTER"
        }
        // 把imagedata对象解析为arraybuffer可打印指令
        await this.imageDataPrintBuffer(imageDataArr, width, height,align);


      }
    }



  },
  // 加载图片
  loadImageData(url) {
    return new Promise(next => {
      wx.request({
        url: this.data.baseUrl + url,
        method: "get",
        success(res) {
          if (res.data) {
            // console.log("加载图片响应==>" + res.data)

            // 这里返回的是imagedata 对象 
            // 老办法是用微信小程序canvas对象把图片渲染上去然后再用getimagedata取出来，但是这个方法要折腾canvas 小程序太shi了，图片渲染上去会错位之类的跟取出来的图片不一致 
            // 打印时候就会又黑边
            // 如果你也一样用spring 这是获取二维码 并转为imagedata的代码
          /*
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

          */

            next(res.data)

          } else {
            Dialog.alert({
              message: '错误码:[28001];尝试获取图片编码失败了',
            }).then(() => {
              // on close
            });
          }
        },
        fail(err) {

          Dialog.alert({
            message: '错误码:[18001];尝试获取图片编码失败了,' + JSON.stringify(err),
          })
          console.log(err);
        }

      })


    })
  },


/*
!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
最主要的打印逻辑在这里 主要的逻辑

*/
  // 开始打印单据  
  async toWriteSqPrint() {
    if (this.data.isPrinting) {
      return Notify({
        type: 'warning',
        message: '操作频繁'
      });;
    }
    this.setData({
      isPrinting: true
    })

    setTimeout(() => {
      this.setData({
        isPrinting: false
      })
    }, 2000);

    wx.showLoading({
      title: '正在编译打印机指令...',
    })
    // 这个全局变量是用来收集打印指令buffer的 每个元素都是arraybuffer类型 且不大于20字节
    readyJobs=[];
    // 编译打印指令 语法是我自己编的 图一乐就好 这个方法就是吧单据数据中的 ext_print_template 字段也就是我编的指令解析为可以直接打印的buffer 并存到readyJobs中
    await this.compileContextToBuffer();
    // 遍历处理
    console.log("打印任务==>",readyJobs)

    // 当前打印到哪里了
    jobIdx=0;
    // 开始去打印
    await this.beforePrintClock()
    wx.hideLoading()
    console.log("结束=>",jobIdx)

  },
  // 处理图片
  async imageDataPrintBuffer(imageDataArr, width, height,align) {
    // 这里注释的 是我用的老方法 我打算用base64 直接获取imagedata对象 但是太难了 没有用这种方式
    // const binaryString = this.baseAtob(imageDataArring.split(",")[1]);
    // const byteArray = new Uint8ClampedArray(binaryString.length);
    // for (let i = 0; i < binaryString.length; i++) {
    //   byteArray[i] = binaryString.charCodeAt(i);
    // }
    // const imgData = new ImageData(byteArray, width, height);
    // // console.log("base64转为Unit8",byteArray);
    // // 

    // imagedata 数组转为unit8array
    const byteArray = new Uint8ClampedArray(imageDataArr.length);
    for (let i = 0; i < imageDataArr.length; i++) {
      byteArray[i] = imageDataArr[i];
    }

    // 黑白处理之类的 不用管
    let arr = this.convert4to2(byteArray);
    let data = this.convert8to1(arr);


    // 除以8 具体看网上解释
    let xl = width / 8
    let xh = height
    console.log("xl，xh",xl,xh)

    // 居中指令合集
    let printAlignCommand = {
      LEFT: [27, 97, 0], //居左
      CENTER: [27, 97, 1], //居中
      RIGHT: [27, 97, 2], //居右
  };
  // [27, 64] 代表初始化打印机 [29, 118, 48, 0, xl, 0, xh, 0]预先设置好 要给纸张留的空间 因为要放图片是吧
  let beforeCmd= toArrayBuffer(Buffer.from([].concat([27, 64],printAlignCommand[align], [29, 118, 48, 0, xl, 0, xh, 0]), 'gb2312'))
  // 打印结束后的指令
  let afterCmd= toArrayBuffer(Buffer.from([].concat([27, 74, 3]), 'gb2312'))


    const cmds = [].concat(data);
    const buffer = toArrayBuffer(Buffer.from(cmds, 'gb2312'));

    // console.log("打印图片最终buffer后==>",buffer);


    // 先给全局readyJobs 添加开始打印图片指令再添加 20字节一段的图片数据 再添加结束打印指令
    readyJobs.push(util.sendDirective([0x1B, 0x40]));
    readyJobs.push(beforeCmd);
    // 限制20字节
    for (let i = 0; i < buffer.byteLength; i = i + 20) { //限制输入数据
      readyJobs.push(buffer.slice(i, i + 20));
    }
    readyJobs.push(afterCmd);



  },

  // 异步打印 把数据按照切割好 异步发送
  async beforePrintClock() {

    let that = this;
    // 必须要异步， 我看其它博主用的settimeout + for 循环最后发现其实就是同步的， 不用异步会断纸 因为打印机有缓存区 满了就断 不会打印了
    for (const iterator of readyJobs) {
      await new Promise(y=>{
        // 把打印指令发到打印机
        that.printBuffer(iterator,y)
      })
    }


  },


  // 打印内容
  printBuffer(buffer,next) {
    console.log('任务索引',jobIdx)
    
    // console.log("打印buffer size",buffer.byteLength)
    if (this.data.inactive.length == 0) {
      next(++jobIdx);
      return Dialog.alert({
        message: '当前并无连接打印机',
      })
    }

    let {
      deviceId,
      serviceId,
      characteristicId
    } = this.data.inactive[0]
    wx.writeBLECharacteristicValue({
      deviceId: deviceId,
      serviceId: serviceId,
      characteristicId: characteristicId,
      value: buffer,
      success(res) {
        next(++jobIdx)
      },
      fail(err) {
        Dialog.alert({
          message: '错误码:[12550];蓝牙设备数据写入失败,' + JSON.stringify(err),
        })
      }
    })
  },
  
  // 转为黑白
  convert4to2(res) {
    let arr = []
    for (let i = 0; i < res.length; i++) {
      if (i % 4 == 0) {
        let rule = 0.29900 * res[i] + 0.58700 * res[i + 1] + 0.11400 * res[i + 2];
        if (rule > 200) {
          res[i] = 0;
        } else {
          res[i] = 1;
        }
        arr.push(res[i]);
      }
    }
    return arr;
  },
  //8合1
  convert8to1(arr) {
    let data = [];
    for (let k = 0; k < arr.length; k += 8) {
      let temp = arr[k] * 128 + arr[k + 1] * 64 + arr[k + 2] * 32 + arr[k + 3] * 16 + arr[k + 4] * 8 + arr[k + 5] * 4 + arr[k + 6] * 2 + arr[k + 7] * 1
      data.push(temp);
    }
    return data;
  },























/*
* 以下这些是连接打印机逻辑
*
*
*
*
*/

  // 打开蓝牙
  queryDeviceList(isShowEmit) {
    let that = this;
    // 先将设备断开
    this.focusDisDevice(() => {
      wx.openBluetoothAdapter({
        mode: "central",
        success(res) {
          console.log(res, "openBluetoothAdapter success");

          that.reflush(isShowEmit)

        },
        fail(err) {

          Dialog.alert({
            message: '错误码:[10012];蓝牙适配器打开失败了,' + JSON.stringify(err),
          })


        },
      })
    })


  },
  // 断开设备
  disDevice() {
    Dialog.confirm({
        title: '提示',
        message: '你确定要断开该设备连接吗？',
        confirmButtonText: "断开"
      })
      .then(() => {
        this.focusDisDevice(() => {
          this.queryDeviceList()
        })
      })
      .catch(() => {});
  },
  //强制断开设备 
  focusDisDevice(callback) {
    let that = this
    wx.closeBluetoothAdapter({
      success(closres) {
        console.log(closres, "closeBluetoothAdapter success");
        Notify({
          type: 'danger',
          message: '设备已断开'
        });
        that.setData({
          id: "",
          inactive: [],
          connectId: "",
          isConnect: false
        })
        if (callback) {
          callback()
        }


      },
      fail(err) {
        if (callback) {
          callback()
        }
      },
      complete() {
        console.log("closeBluetoothAdapter complete");
      }
    })
  },
  // 搜索设备，刷新列表
  reflush(isShowEmit) {
    console.log("搜索设备")
    let that = this
    wx.startBluetoothDevicesDiscovery({
      success(res) {
        if (firstOpenLoad || isShowEmit) {
          let history = wx.getStorageSync('historyLocalDevice')

          if (history) {
            Notify({
              type: 'warning',
              message: '尝试重新连接设备'
            });
            that.setData({
              deviceList: [history]
            })

            that.concatDevice({}, history)
          } else {
            that.setData({
              deviceList: []
            })
          }
          firstOpenLoad = false;
        }
        that.listennerNewDevice()
      },
      fail(res) {
        Dialog.alert({
          message: '错误码:[10173];蓝牙设备搜索失败了,' + JSON.stringify(err),
        })
        console.log("startBluetoothDevicesDiscovery失败", res)
      }
    })
  },
  //监听新设备
  listennerNewDevice() {
    let that = this
    wx.onBluetoothDeviceFound(function (res) {
      let devices = res.devices;
      console.log(res, "搜索设备")
      if (devices[0].name != '') {
        let list = that.data.deviceList
        // 当前设备在设备列表中是否存在 如果不存在则添加，存在则修改
        let idx = list.findIndex(de => {
          return de.deviceId == devices[0].deviceId
        })
        if (idx >= 0) {
          list[idx] = devices[0]
        } else {
          list.push(devices[0])
        }
        that.setData({
          deviceList: list,
        })
      }
    })
  },
  // 连接设备
  concatDevice(item, history) {
    let that = this
    let device
    if (history) {
      device = history
    } else {
      device = item.currentTarget.dataset.item
    }
    wx.setStorageSync('historyLocalDevice', {
      ...device
    })

    this.setData({
      connectId: device.deviceId,
      isConnect: true
    })

    wx.createBLEConnection({
      deviceId: device.deviceId,
      timeout: 4000,
      success(rse1) {
        wx.getBLEDeviceServices({
          deviceId: device.deviceId,
          complete(rse2) {
            if (rse2.errCode != 0) {

              if (rse2.errCode == 10012) {
                Dialog.alert({
                  message: '错误码:[18332];连接蓝牙超时,' + JSON.stringify(rse2),
                })
                that.setData({
                  isConnect: false
                })
              } else {
                Dialog.alert({
                  message: '错误码:[13332];连接蓝牙异常,' + JSON.stringify(rse2),
                })
                that.setData({
                  isConnect: false
                })
              }
              return
            }
            //查询特征值
            that.setData({
              inactive: []
            })

            for (let i in rse2.services) {
              wx.getBLEDeviceCharacteristics({
                deviceId: device.deviceId,
                serviceId: rse2.services[i].uuid,
                complete(rse3) {
                  let arrService = []
                  for (let j in rse3.characteristics) {
                    if (rse3.characteristics[j].properties.write) {
                      arrService.push({
                        deviceId: device.deviceId,
                        serviceId: rse2.services[i].uuid,
                        characteristicId: rse3.characteristics[j].uuid,
                        name: device.name
                      })
                      that.setData({
                        inactive: arrService,
                        id: device.deviceId,
                        isConnect: false
                      })
                      Notify({
                        type: 'success',
                        message: '蓝牙连接成功'
                      });
                      break;
                    }
                  }
                },
                fail(err) {
                  Dialog.alert({
                    message: '错误码:[11254];获取蓝牙设备特征值失败了,' + JSON.stringify(err),
                  })
                }
              })
            }
          },
          fail(err) {
            Dialog.alert({
              message: '错误码:[10288];获取蓝牙服务列表失败了,' + JSON.stringify(err),
            })
          }
        })
      },
      fail(err) {

        Dialog.alert({
          message: '错误码:[10233];与蓝牙设备创建连接失败了,' + JSON.stringify(err),
        })

        that.setData({
          isConnect: false
        })
      },
      complete() {
        // 停止搜索
        wx.stopBluetoothDevicesDiscovery({
          success() {}
        })
      }
    })
  },



})