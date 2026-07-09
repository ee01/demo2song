import Taro from "@tarojs/taro";

function sanitizeFileName(name: string): string {
  const trimmed = (name || "我的歌曲").replace(/[\\/:*?"<>|]/g, "").slice(0, 40);
  return `${trimmed || "我的歌曲"}.mp3`;
}

function getErrorText(error: unknown): string {
  if (error && typeof error === "object" && "errMsg" in error) {
    return String((error as { errMsg?: unknown }).errMsg || "");
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error || "");
}

function getShareFileMessage() {
  return (Taro as unknown as {
    shareFileMessage?: (options: {
      filePath: string;
      fileName?: string;
      success?: () => void;
      fail?: (error: unknown) => void;
    }) => void;
  }).shareFileMessage;
}

async function saveToMiniProgramLocalFile(tempFilePath: string, fileName: string): Promise<void> {
  const fs = Taro.getFileSystemManager();
  const target = `${Taro.env.USER_DATA_PATH}/${Date.now()}-${fileName}`;
  await new Promise<void>((resolve, reject) => {
    fs.saveFile({
      tempFilePath,
      filePath: target,
      success: () => resolve(),
      fail: (error) => reject(error)
    });
  });
  await Taro.showToast({ title: "已保存到小程序本地", icon: "success" });
}

function promptShareDownloadedFile(filePath: string, fileName: string): void {
  const shareFileMessage = getShareFileMessage();
  if (typeof shareFileMessage !== "function") {
    void saveToMiniProgramLocalFile(filePath, fileName);
    return;
  }

  Taro.showModal({
    title: "音频已下载",
    content: "点击「发送文件」后可选择文件传输助手或好友保存。",
    confirmText: "发送文件",
    cancelText: "取消",
    success: (result) => {
      if (!result.confirm) {
        return;
      }
      shareFileMessage({
        filePath,
        fileName,
        fail: async (error) => {
          const detail = getErrorText(error);
          await Taro.showModal({
            title: "发送失败",
            content: detail
              ? `原因：${detail}\n\n请再点一次「下载保存」重试。`
              : "请再点一次「下载保存」重试。",
            showCancel: false
          });
        }
      });
    }
  });
}

/**
 * 微信小程序无法把音频存入系统相册：PC 端尝试保存到磁盘，
 * 移动端用"转发文件到聊天"，用户可选择文件传输助手保存。
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
    const platform = Taro.getSystemInfoSync().platform;
    const saveToDisk = (Taro as unknown as {
      saveFileToDisk?: (options: {
        filePath: string;
        success?: () => void;
        fail?: (error: unknown) => void;
      }) => void;
    }).saveFileToDisk;

    if ((platform === "windows" || platform === "mac") && typeof saveToDisk === "function") {
      await new Promise<void>((resolve, reject) => {
        saveToDisk({
          filePath: downloaded.tempFilePath,
          success: () => resolve(),
          fail: (error) => reject(error)
        });
      });
      Taro.hideLoading();
      await Taro.showToast({ title: "已保存", icon: "success" });
      return;
    }

    Taro.hideLoading();
    promptShareDownloadedFile(downloaded.tempFilePath, fileName);
  } catch (error) {
    Taro.hideLoading();
    const detail = getErrorText(error);
    await Taro.showModal({
      title: "保存失败",
      content: detail
        ? `原因：${detail}\n\n请确认音频域名已配置到 downloadFile 合法域名；也可用右上角分享保存。`
        : "请确认音频域名已配置到 downloadFile 合法域名；也可用右上角分享保存。",
      showCancel: false
    });
  }
}
