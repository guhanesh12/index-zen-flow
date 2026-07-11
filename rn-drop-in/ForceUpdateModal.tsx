// Drop-in <ForceUpdateModal /> for React Native.
// import { checkAppUpdate } from './checkAppUpdate';
// import ForceUpdateModal from './ForceUpdateModal';
//
// const [info, setInfo] = useState(null);
// useEffect(() => { checkAppUpdate(APP_VERSION).then(setInfo); }, []);
// return (<>{info?.updateAvailable && <ForceUpdateModal info={info} />}{/* rest */}</>);

import React, { useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { openStore, type UpdateInfo } from './checkAppUpdate';

interface Props { info: UpdateInfo; }

export default function ForceUpdateModal({ info }: Props) {
  const [visible, setVisible] = useState(true);
  if (!info.updateAvailable) return null;

  const onUpdate = () => openStore(info.storeUrl);
  const onLater = () => setVisible(false);

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={() => info.forceUpdate ? null : setVisible(false)}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{info.title}</Text>
          <Text style={styles.msg}>{info.message}</Text>
          <Text style={styles.meta}>Installed: {info.currentVersion}  •  Latest: {info.latestVersion}</Text>
          <TouchableOpacity style={styles.primary} onPress={onUpdate}>
            <Text style={styles.primaryText}>Update Now</Text>
          </TouchableOpacity>
          {!info.forceUpdate && (
            <TouchableOpacity style={styles.secondary} onPress={onLater}>
              <Text style={styles.secondaryText}>Later</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 400, backgroundColor: '#0f172a', borderRadius: 16, padding: 24, borderWidth: 1, borderColor: '#1e40af55' },
  title: { color: '#fff', fontSize: 20, fontWeight: '700', marginBottom: 8 },
  msg: { color: '#cbd5e1', fontSize: 14, lineHeight: 20, marginBottom: 12 },
  meta: { color: '#64748b', fontSize: 12, marginBottom: 20 },
  primary: { backgroundColor: '#2563eb', paddingVertical: 12, borderRadius: 10, alignItems: 'center', marginBottom: 8 },
  primaryText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  secondary: { paddingVertical: 10, alignItems: 'center' },
  secondaryText: { color: '#94a3b8', fontSize: 14 },
});
