import { ScrollView, Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { saveVoiceprintAgreement } from "../../utils/voiceprintAgreement";
import "./index.scss";

const sections = [
  {
    title: "一、授权范围",
    body: [
      "当你使用哼唱录音、生成 demo、生成完整版歌曲等功能时，我们会在你主动点击录音并上传后，收集你录制的音频内容。音频中可能包含能够反映个人声音特征的声纹信息。",
      "你点击首页授权提示中的“同意”按钮，即表示你已阅读、理解并同意本协议。未取得你的同意前，我们不会开始录音采集。"
    ]
  },
  {
    title: "二、收集和使用目的",
    body: [
      "我们收集和使用声纹相关信息，仅用于识别和分析你主动提交的哼唱旋律、节奏、音高、音色等音频特征，并据此生成 demo 或完整歌曲。",
      "我们不会将声纹信息用于身份识别、身份认证、信用评价、精准营销，或与本小程序音乐生成服务无关的其他用途。"
    ]
  },
  {
    title: "三、收集方式",
    body: [
      "声纹相关信息由你在小程序内主动按住麦克风录制并提交后产生。录音结束后，小程序会将音频文件上传至服务端用于生成歌曲。",
      "你可以选择不录音或不提交录音；不提交录音不会影响你浏览已生成作品等非录音功能。"
    ]
  },
  {
    title: "四、存储和保护",
    body: [
      "我们会将你提交的录音、生成任务信息和生成结果存储在服务端，用于完成歌曲生成、作品播放、下载和历史记录展示。",
      "我们会采取合理的技术和管理措施保护相关信息，防止未经授权的访问、披露、篡改或丢失。"
    ]
  },
  {
    title: "五、共享和委托处理",
    body: [
      "为完成音乐生成、音频存储、播放和下载服务，我们可能会委托云服务、对象存储或音乐生成服务提供方处理你提交的音频。受托方只能按照我们的授权目的处理相关信息。",
      "除法律法规要求、取得你另行同意，或为实现本协议载明的功能所必需外，我们不会向无关第三方提供你的声纹相关信息。"
    ]
  },
  {
    title: "六、撤回授权和删除",
    body: [
      "你可以停止使用录音和生成歌曲功能来撤回后续收集授权。撤回授权不会影响撤回前已基于你的同意进行的信息处理。",
      "如需删除已提交的录音或生成作品，可以通过小程序提供的相关功能或联系我们处理。删除后，相关作品可能无法继续播放、下载或重新生成。"
    ]
  },
  {
    title: "七、协议更新",
    body: [
      "如本协议内容发生重大变化，我们会在小程序内以弹窗、提示或页面公告等方式通知你，并在必要时重新取得你的授权同意。"
    ]
  }
];

export default function VoiceprintAgreementPage() {
  function acceptAndBack() {
    try {
      saveVoiceprintAgreement();
      Taro.showToast({ title: "已同意", icon: "success" });
      setTimeout(() => {
        Taro.navigateBack();
      }, 350);
    } catch {
      Taro.showToast({ title: "授权保存失败，请重试", icon: "none" });
    }
  }

  return (
    <ScrollView className="agreement-page" scrollY>
      <View className="agreement-content">
        <Text className="agreement-title">声纹授权协议</Text>
        <Text className="agreement-date">生效日期：2026年7月9日</Text>
        <Text className="agreement-intro">
          欢迎使用随哼。为了将你的哼唱录音生成歌曲，我们需要在你授权同意后收集、使用和存储你主动提交的录音及其中可能包含的声纹信息。请在使用录音功能前仔细阅读本协议。
        </Text>

        {sections.map((section) => (
          <View key={section.title} className="agreement-section">
            <Text className="section-title">{section.title}</Text>
            {section.body.map((paragraph) => (
              <Text key={paragraph} className="section-body">
                {paragraph}
              </Text>
            ))}
          </View>
        ))}
      </View>
      <View className="agreement-action-bar">
        <View className="agreement-accept" onClick={acceptAndBack}>
          同意并返回
        </View>
      </View>
    </ScrollView>
  );
}
