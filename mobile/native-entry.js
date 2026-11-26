import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';
if (Capacitor.isNativePlatform()) window.FrontierNative = {
  async exportReport(report) {
    const path = 'frontier-feedback-' + Date.now() + '.json';
    const file = await Filesystem.writeFile({path, data: JSON.stringify(report, null, 2), directory: Directory.Cache, encoding: Encoding.UTF8});
    await Share.share({title: 'Frontier Kingdom feedback', url: file.uri});
    // Cache file remains available to the chosen share target; Android manages cache storage.
  }
};
