export default defineAppConfig({
  requiredBackgroundModes: ["audio"],
  pages: [
    "pages/index/index",
    "pages/voiceprint-agreement/index",
    "pages/full/index",
    "pages/generation/index",
    "pages/song/index",
    "pages/library/index",
    "pages/play/index"
  ],
  window: {
    backgroundTextStyle: "light",
    navigationBarBackgroundColor: "#ffffff",
    navigationBarTitleText: "随哼",
    navigationBarTextStyle: "black"
  }
});
