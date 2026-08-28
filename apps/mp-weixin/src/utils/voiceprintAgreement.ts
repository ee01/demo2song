import Taro from "@tarojs/taro";

const VOICEPRINT_AGREEMENT_KEY = "demo2song_voiceprint_agreement_v1";
const VOICEPRINT_AGREEMENT_ACCEPTED = "accepted";

export function hasVoiceprintAgreement() {
  try {
    return Taro.getStorageSync(VOICEPRINT_AGREEMENT_KEY) === VOICEPRINT_AGREEMENT_ACCEPTED;
  } catch {
    return false;
  }
}

export function saveVoiceprintAgreement() {
  Taro.setStorageSync(VOICEPRINT_AGREEMENT_KEY, VOICEPRINT_AGREEMENT_ACCEPTED);
}
