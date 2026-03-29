import React, { useState } from 'react';
import { ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { QrCode, Lock, Clock, FileText, User, Share2, Unlock, Image as ImageIcon } from 'lucide-react-native';
import { YStack, XStack, Text, Button, View } from 'tamagui';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { getOrCreateEncryptionKeypair, decryptFromSender } from '../services/nacl-crypto';
import { importAESKey, decryptData } from '../services/crypto';
import ipfsService from '../services/ipfs.service';
import keyShareService from '../services/keyShare.service';
import walletActionService from '../services/walletAction.service';

type RouteRecord = {
    cidHash?: string;
    title?: string;
    type?: string;
    date?: string;
    createdByDisplay?: string;
};

export default function RecordDetailScreen({ route }: any) {
    const record: RouteRecord = route?.params?.record || {};

    const [isDecrypting, setIsDecrypting] = useState(false);
    const [decryptedData, setDecryptedData] = useState<any>(null);
    const [decryptError, setDecryptError] = useState<string | null>(null);

    const handleDecrypt = async () => {
        setIsDecrypting(true);
        setDecryptError(null);

        try {
            let cid: string | undefined;
            let aesKeyString: string | undefined;

            const localRecordsStr = await AsyncStorage.getItem('ehr_local_records');
            const localRecords = localRecordsStr ? JSON.parse(localRecordsStr) : {};
            const localData = localRecords[record.cidHash || ''];

            if (localData) {
                cid = localData.cid;
                aesKeyString = localData.aesKey;
            } else {
                const sharedKey = await keyShareService.getKeyForRecord(record.cidHash);
                if (!sharedKey) {
                    throw new Error('Khong tim thay key giai ma. Ban co the chua duoc chia se key cho ho so nay.');
                }

                if (sharedKey.status === 'pending' && sharedKey.id) {
                    try {
                        keyShareService.claimKey(sharedKey.id);
                    } catch (e) {
                        console.warn('Auto-claim failed:', e);
                    }
                }

                const { walletClient, address } = await walletActionService.getWalletContext();

                const myKeypair = await getOrCreateEncryptionKeypair(walletClient, address);
                let keyData: any;

                try {
                    const decryptedPayload = decryptFromSender(sharedKey.encryptedPayload, sharedKey.senderPublicKey, myKeypair.secretKey);
                    keyData = JSON.parse(decryptedPayload);
                } catch {
                    try {
                        const decodedStr = Buffer.from(sharedKey.encryptedPayload, 'base64').toString('utf8');
                        keyData = JSON.parse(decodedStr);
                    } catch {
                        try {
                            keyData = JSON.parse(sharedKey.encryptedPayload);
                        } catch {
                            throw new Error('Khong the giai ma key. Format khong hop le.');
                        }
                    }
                }

                if (keyData?.cid && keyData?.aesKey) {
                    cid = keyData.cid;
                    aesKeyString = keyData.aesKey;
                } else if (keyData?.metadata?.cid && keyData?.aesKey) {
                    cid = keyData.metadata.cid;
                    aesKeyString = keyData.aesKey;
                } else {
                    throw new Error('Key da duoc ma hoa bang khoa cu hoac khong hop le.');
                }
            }

            if (!cid || !aesKeyString) throw new Error('Thieu cid hoac aes key.');

            const encryptedContent = await ipfsService.download(cid);
            const aesKey = await importAESKey(aesKeyString);
            const decrypted: any = await decryptData(encryptedContent, aesKey);
            setDecryptedData(decrypted);

            if (!localData && record.cidHash) {
                try {
                    const latestLocalRecordsStr = await AsyncStorage.getItem('ehr_local_records');
                    const latestRecords = latestLocalRecordsStr ? JSON.parse(latestLocalRecordsStr) : {};
                    if (!latestRecords[record.cidHash]) {
                        latestRecords[record.cidHash] = {
                            cid,
                            aesKey: aesKeyString,
                            title: decrypted?.meta?.title || record.title || 'Ho so duoc chia se',
                        };
                        await AsyncStorage.setItem('ehr_local_records', JSON.stringify(latestRecords));
                    }
                } catch (e) {
                    console.error('Error saving shared key:', e);
                }
            }
        } catch (err: any) {
            console.error('Decrypt error:', err);
            setDecryptError(err.message || 'Khong the giai ma ho so');
            Alert.alert('Loi giai ma', err.message || 'Khong the giai ma ho so');
        } finally {
            setIsDecrypting(false);
        }
    };

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: '#F8FAFC' }} edges={['bottom', 'left', 'right']}>
            <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 10 }}>
                <View background="$background" borderColor="$borderColor" style={{ borderWidth: 1, borderRadius: 12, padding: 16, marginBottom: 18 }}>
                    <View background="olive" style={{ width: 48, height: 48, borderRadius: 24, marginBottom: 12, alignItems: 'center', justifyContent: 'center' }}>
                        <FileText size={24} color="#2563EB" />
                    </View>
                    <Text fontSize="$6" fontWeight="700" color="$color12" style={{ marginBottom: 8 }}>
                        {record.title || record.type || 'Ho so y te khong ten'}
                    </Text>
                    <XStack style={{ alignItems: 'center', marginBottom: 4 }}>
                        <Clock size={14} color="#64748B" style={{ marginRight: 8 }} />
                        <Text fontSize="$3" color="$color10">{record.date || 'Khong co ngay'}</Text>
                    </XStack>
                    <XStack style={{ alignItems: 'center' }}>
                        <User size={14} color="#64748B" style={{ marginRight: 8 }} />
                        <Text fontSize="$3" color="$color10">{record.createdByDisplay || 'Nguoi tao khong ro'}</Text>
                    </XStack>
                </View>

                {!decryptedData ? (
                    <View background={decryptError ? '$red2' : '$indigo2'} style={{ borderWidth: 1, borderColor: decryptError ? '#f87171' : '#818cf8', borderRadius: 10, padding: 14, marginBottom: 18 }}>
                        <XStack style={{ alignItems: 'center', marginBottom: 8 }}>
                            <Lock size={20} color="#475569" style={{ marginRight: 8 }} />
                            <Text fontSize="$4" fontWeight="700" color="$color11">Du lieu duoc ma hoa</Text>
                        </XStack>
                        <Text fontSize="$3" color="$color10" style={{ lineHeight: 20, marginBottom: 12 }}>
                            Ho so nay da duoc ma hoa tren IPFS. Ban can giai ma bang khoa chia se de xem.
                        </Text>
                        {decryptError ? <Text fontSize="$3" color="$red10" style={{ marginBottom: 10 }}>{decryptError}</Text> : null}
                        <Button size="$4" background="olive" pressStyle={{ background: 'olive' }} icon={isDecrypting ? undefined : <Unlock size={18} color="white" />} onPress={handleDecrypt} disabled={isDecrypting} opacity={isDecrypting ? 0.7 : 1}>
                            <Text color="white" fontWeight="700">{isDecrypting ? 'Dang giai ma...' : 'Giai ma noi dung'}</Text>
                        </Button>
                    </View>
                ) : (
                    <View background="$green2" borderColor="$green4" style={{ borderWidth: 1, borderRadius: 10, padding: 14, marginBottom: 18 }}>
                        <XStack style={{ alignItems: 'center', marginBottom: 10 }}>
                            <Unlock size={20} color="#16A34A" style={{ marginRight: 8 }} />
                            <Text fontSize="$5" fontWeight="700" color="$green11">Noi dung da giai ma</Text>
                        </XStack>

                        {(decryptedData?.imageData || (decryptedData?.attachment?.data && decryptedData?.attachment?.contentType?.startsWith('image/'))) ? (
                            <YStack style={{ marginBottom: 12, alignItems: 'center' }}>
                                <View borderColor="$borderColor" style={{ borderWidth: 1, borderRadius: 10, overflow: 'hidden' }}>
                                    <Text style={{ padding: 8, fontSize: 13, fontWeight: '700' }} color="$color11">Hinh anh dinh kem</Text>
                                    <XStack background="$background" style={{ padding: 16, justifyContent: 'center' }}>
                                        <ImageIcon size={48} color="#94A3B8" />
                                    </XStack>
                                </View>
                            </YStack>
                        ) : null}

                        {decryptedData?.meta ? (
                            <YStack style={{ marginBottom: 12 }}>
                                <Text fontSize="$3" fontWeight="700" color="$color11">Thong tin bo sung:</Text>
                                <Text fontSize="$3" color="$color12">- Tieu de: {decryptedData.meta.title}</Text>
                                <Text fontSize="$3" color="$color12">- Loai: {decryptedData.meta.type}</Text>
                            </YStack>
                        ) : null}

                        {decryptedData?.observations && Object.keys(decryptedData.observations).length > 0 ? (
                            <YStack>
                                <Text fontSize="$4" fontWeight="700" color="$color11" style={{ marginBottom: 8 }}>Quan trac lam sang</Text>
                                {Object.entries(decryptedData.observations).map(([key, val]: any) => (
                                    <XStack key={key} style={{ justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#e2e8f0', paddingVertical: 6 }}>
                                        <Text fontSize="$3" color="$color10" style={{ textTransform: 'capitalize' }}>{key}</Text>
                                        <Text fontSize="$3" fontWeight="700" color="$color12">{String(val)}</Text>
                                    </XStack>
                                ))}
                            </YStack>
                        ) : null}

                        {decryptedData?.diagnoses?.length ? (
                            <YStack style={{ marginTop: 12 }}>
                                <Text fontSize="$4" fontWeight="700" color="$color11" style={{ marginBottom: 8 }}>Chan doan</Text>
                                {decryptedData.diagnoses.map((d: string, i: number) => (
                                    <Text key={i} fontSize="$3" color="$color12" style={{ marginBottom: 4 }}>- {d}</Text>
                                ))}
                            </YStack>
                        ) : null}

                        {decryptedData?.prescriptions?.length ? (
                            <YStack style={{ marginTop: 12 }}>
                                <Text fontSize="$4" fontWeight="700" color="$color11" style={{ marginBottom: 8 }}>Don thuoc</Text>
                                {decryptedData.prescriptions.map((p: any, i: number) => (
                                    <Text key={i} fontSize="$3" color="$color12" style={{ marginBottom: 4 }}>
                                        - {p.medication} - {p.dosage} ({p.frequency})
                                    </Text>
                                ))}
                            </YStack>
                        ) : null}
                    </View>
                )}

                <Text fontSize="$5" fontWeight="700" color="$color12" style={{ marginBottom: 12 }}>Tuy chon chia se</Text>
                <YStack style={{ gap: 10 }}>
                    <View background="$background" borderColor="olive" style={{ borderWidth: 1, borderRadius: 10, padding: 14 }}>
                        <XStack style={{ alignItems: 'center' }}>
                            <View background="olive" style={{ width: 40, height: 40, borderRadius: 20, marginRight: 10, alignItems: 'center', justifyContent: 'center' }}>
                                <Share2 size={20} color="#2563EB" />
                            </View>
                            <YStack>
                                <Text fontSize="$4" fontWeight="700" color="$color12">Chia se qua vi (Address)</Text>
                                <Text fontSize="$2" color="$color10">Cap quyen online cho bac si</Text>
                            </YStack>
                        </XStack>
                    </View>

                    <View background="$background" borderColor="$green4" style={{ borderWidth: 1, borderRadius: 10, padding: 14 }}>
                        <XStack style={{ alignItems: 'center' }}>
                            <View background="$green3" style={{ width: 40, height: 40, borderRadius: 20, marginRight: 10, alignItems: 'center', justifyContent: 'center' }}>
                                <QrCode size={20} color="#16A34A" />
                            </View>
                            <YStack>
                                <Text fontSize="$4" fontWeight="700" color="$color12">Hien thi ma QR</Text>
                                <Text fontSize="$2" color="$color10">Cho phep bac si quet ma tai cho</Text>
                            </YStack>
                        </XStack>
                    </View>
                </YStack>
            </ScrollView>
        </SafeAreaView>
    );
}






