import Taro from "@tarojs/taro";

function sanitizeFileName(name: string): string {
  const trimmed = (name || "我的歌曲").replace(/[\\/:*?"<>|]/g, "").slice(0, 40);
  return `${trimmed || "我的歌曲"}.mp3`;
}

/**
 * 微信小程序无法把音频存入系统相册，这里走"下载到本地文件 + 系统保存对话框"，
 * 不支持时回退到提示用户用右上角分享/转发保存。
 */
export async function saveSong(playbackUrl: string | undefined, title: string): Promise<void> {
  if (!playbackUrl) {
    await Taro.showToast({ title: "歌曲还没准备好", icon: "none" });
    return;
  }

  await Taro.showLoading({ title: "下载中…" });
  try {
    const downloaded = await Taro.downloadFile({ url: playbackUrl });
    if (downloaded.statusCode >= 400 || !downloaded.tempFilePath) {
      throw new Error(`下载失败 ${downloaded.statusCode}`);
    }

    const fileName = sanitizeFileName(title);
    const saveToDisk = (Taro as unknown as {
      saveFileToDisk?: (options: {
        filePath: string;
        fileName?: string;
        success?: () => void;
        fail?: (error: unknown) => void;
      }) => void;
    }).saveFileToDisk;

    if (typeof saveToDisk === "function") {
      await new Promise<void>((resolve, reject) => {
        saveToDisk({
          filePath: downloaded.tempFilePath,
          fileName,
          success: () => resolve(),
          fail: (error) => reject(error)
        });
      });
      Taro.hideLoading();
      await Taro.showToast({ title: "已保存", icon: "success" });
      return;
    }

    // 回退：存入小程序本地文件系统
    const fs = Taro.getFileSystemManager();
    const target = `${Taro.env.USER_DATA_PATH}/${Date.now()}-${fileName}`;
    await new Promise<void>((resolve, reject) => {
      fs.saveFile({
        tempFilePath: downloaded.tempFilePath,
        filePath: target,
        success: () => resolve(),
        fail: (error) => reject(error)
      });
    });
    Taro.hideLoading();
    await Taro.showToast({ title: "已保存到本地", icon: "success" });
  } catch (error) {
    Taro.hideLoading();
    await Taro.showModal({
      title: "保存失败",
      content: "可点击右上角「···」转发给好友或「文件传输助手」来保存。",
      showCancel: false
    });
  }
}
