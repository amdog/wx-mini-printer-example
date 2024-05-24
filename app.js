
// app.js

const {
  miniProgram: {
    envVersion
  }
} = wx.getAccountInfoSync();

App({
  onLaunch() {
    this.globalData.version = envVersion;

  },
  globalData: {

  }
})
