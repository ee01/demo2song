export default defineAppConfig({
  requiredBackgroundModes: ["audio"],
  pages: [
    "pages/index/index",
    "pages/full/index",
    "pages/song/index",
    "pages/library/index",
    "pages/play/index"
  ],
  window: {
    backgroundTextStyle: "light",
    navigationBarBackgroundColor: "#ffffff",
    navigationBarTitleText: "Demo2Song",
    navigationBarTextStyle: "black"
  }
});
