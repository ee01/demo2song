from pathlib import Path
import subprocess, plistlib, shutil, hashlib, re, json
import argparse
parser=argparse.ArgumentParser(description="Sign a separate offline-only hardware test package using an existing development profile. No App IDs or profiles are registered.")
parser.add_argument('--udid',required=True)
args=parser.parse_args()
root=Path(__file__).resolve().parents[1]
source=root/'.harness/ios-build/products/Debug-iphoneos/Suiheng.app'
assert source.exists(), 'Build the unsigned Debug app first'
identities=subprocess.check_output(['security','find-identity','-v','-p','codesigning'],text=True)
phone=args.udid
profile=None; data=None; identity=None
for folder in [Path.home()/'Library/MobileDevice/Provisioning Profiles',Path.home()/'Library/Developer/Xcode/UserData/Provisioning Profiles']:
 for candidate in folder.glob('*.mobileprovision'):
  result=subprocess.run(['security','cms','-D','-i',str(candidate)],capture_output=True)
  if result.returncode: continue
  value=plistlib.loads(result.stdout)
  if phone not in value.get('ProvisionedDevices',[]) or not value.get('Entitlements',{}).get('application-identifier','').endswith('.*'): continue
  for certificate in value.get('DeveloperCertificates',[]):
   fingerprint=hashlib.sha1(certificate).hexdigest().upper()
   if fingerprint in identities: profile=candidate;data=value;identity=fingerprint;break
assert profile is not None and data is not None and identity is not None, 'No existing development profile and identity cover this device'
team=data['TeamIdentifier'][0]
base=root/'.harness/hardware-test'
base.mkdir(parents=True,exist_ok=True)
target=base/'Suiheng.app'
if target.exists(): shutil.rmtree(target)
shutil.copytree(source,target)
appid='me.eexx.suiheng.hardwaretest'
def plist(path, changes):
 content=plistlib.loads(path.read_bytes());content.update(changes);path.write_bytes(plistlib.dumps(content,fmt=plistlib.FMT_BINARY))
plist(target/'Info.plist',{'CFBundleIdentifier':appid,'CFBundleDisplayName':'随哼硬件测试','D2S_HARDWARE_TEST':True})
for framework in (target/'Frameworks').glob('*'):
 subprocess.run(['codesign','--force','--sign',identity,'--timestamp=none',str(framework)],check=True)
def sign(bundle, bundleid):
 shutil.copyfile(profile,bundle/'embedded.mobileprovision')
 entitlements={'application-identifier':f'{team}.{bundleid}','com.apple.developer.team-identifier':team,'get-task-allow':True,'keychain-access-groups':[f'{team}.{bundleid}']}
 path=base/(bundle.name+'.entitlements.plist');path.write_bytes(plistlib.dumps(entitlements))
 subprocess.run(['codesign','--force','--sign',identity,'--timestamp=none','--generate-entitlement-der','--entitlements',str(path),str(bundle)],check=True)
for extension in (target/'PlugIns').glob('*.appex'):
 extensionid=appid+'.widgets';plist(extension/'Info.plist',{'CFBundleIdentifier':extensionid});sign(extension,extensionid)
for dylib in target.glob('*.dylib'):
 subprocess.run(['codesign','--force','--sign',identity,'--timestamp=none',str(dylib)],check=True)
sign(target,appid)
subprocess.run(['codesign','--verify','--deep','--strict',str(target)],check=True)
print('Signed and verified isolated offline hardware-test app:',appid)
