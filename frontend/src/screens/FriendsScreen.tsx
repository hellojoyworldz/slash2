import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TFunction } from 'i18next';
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { api, ApiError, Friend } from '../api';
import { Button } from '../components/Button';
import { Text } from '../components/Text';
import { confirmDialog } from '../notify';
import { colors, layout } from '../theme';

interface Props {
  token: string | null;
  email: string;
  displayName?: string | null;
  onOpenChat: () => void;
  onOpenFriend: (friend: Friend) => void;
  onLogout: () => void;
}

// 앱 내부 모달로 삭제 확인을 받는다.
async function confirmDelete(name: string, t: TFunction, onConfirm: () => void) {
  const ok = await confirmDialog({
    title: t('common.delete'),
    message: t('friends.confirmDelete', { name }),
    confirmLabel: t('common.delete'),
    cancelLabel: t('common.cancel'),
    destructive: true,
  });
  if (ok) onConfirm();
}

export function FriendsScreen({
  token,
  email,
  displayName,
  onOpenChat,
  onOpenFriend,
  onLogout,
}: Props) {
  const { t } = useTranslation();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const myName = displayName || email.split('@')[0] || t('common.me');

  useFocusEffect(
    useCallback(() => {
      if (!token) return;
      let cancelled = false;
      (async () => {
        try {
          const list = await api.listFriends(token);
          if (!cancelled) setFriends(list);
        } catch (error) {
          if (error instanceof ApiError && error.status === 401) onLogout();
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [token, onLogout]),
  );

  const openModal = () => {
    setNameInput('');
    setFormError('');
    setModalOpen(true);
  };

  const addFriend = async () => {
    const name = nameInput.trim();
    if (!name) {
      setFormError(t('friends.nameRequired'));
      return;
    }
    if (!token) {
      setFormError(t('friends.loginToAdd'));
      return;
    }
    setSubmitting(true);
    setFormError('');
    try {
      const friend = await api.createFriend(token, name);
      setFriends((prev) =>
        [...prev, friend].sort((a, b) => a.name.localeCompare(b.name)),
      );
      setModalOpen(false);
    } catch {
      setFormError(t('friends.addFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const removeFriend = (friend: Friend) => {
    if (!token) return;
    confirmDelete(friend.name, t, async () => {
      try {
        await api.deleteFriend(token, friend.id);
        setFriends((prev) => prev.filter((f) => f.id !== friend.id));
      } catch {
        // 삭제 실패는 목록 유지로 알 수 있으니 조용히 넘어간다.
      }
    });
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text variant="title">{t('friends.title')}</Text>
        <TouchableOpacity
          onPress={openModal}
          hitSlop={{ top: 8, bottom: 8, left: 8 }}
          accessibilityRole="button"
        >
          <Text variant="bodyStrong" color={colors.ink}>
            {t('friends.add')}
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={friends}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <>
            {/* 내 프로필 — 누르면 나에게 채팅으로 */}
            <TouchableOpacity
              style={styles.profileRow}
              onPress={onOpenChat}
              activeOpacity={0.6}
              accessibilityRole="button"
            >
              <View style={styles.myAvatar}>
                <Text variant="heading" color={colors.inverse}>
                  {myName.charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={styles.profileInfo}>
                <Text variant="heading">{myName}</Text>
                <Text
                  variant="label"
                  color={colors.textSecondary}
                  style={styles.profileStatus}
                >
                  {t('friends.sendToMe')}
                </Text>
              </View>
            </TouchableOpacity>

            <View style={styles.divider} />
            <Text variant="caption" color={colors.textTertiary} style={styles.sectionLabel}>
              {t('friends.count', { count: friends.length })}
            </Text>
          </>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.friendRow}
            activeOpacity={0.6}
            onPress={() => onOpenFriend(item)}
            onLongPress={() => removeFriend(item)}
            accessibilityRole="button"
          >
            <View style={styles.friendAvatar}>
              <Text variant="subheading" color={colors.ink}>
                {item.name.charAt(0).toUpperCase()}
              </Text>
            </View>
            <Text variant="bodyStrong" style={styles.friendName}>
              {item.name}
            </Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text variant="label" color={colors.textTertiary} style={styles.emptyText}>
              {t('friends.emptyHint')}
            </Text>
          </View>
        }
        contentContainerStyle={styles.listContent}
      />

      {/* 친구 추가 모달 */}
      <Modal
        visible={modalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setModalOpen(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalCard}>
            <Text variant="heading">{t('friends.addTitle')}</Text>
            <TextInput
              style={styles.modalInput}
              placeholder={t('friends.namePlaceholder')}
              placeholderTextColor={colors.textTertiary}
              value={nameInput}
              onChangeText={(text) => {
                setNameInput(text);
                if (formError) setFormError('');
              }}
              maxLength={30}
              autoFocus
              onSubmitEditing={addFriend}
            />
            {formError ? (
              <Text variant="caption" color={colors.textSecondary} style={styles.modalError}>
                {formError}
              </Text>
            ) : null}
            <View style={styles.modalActions}>
              <Button
                label={t('common.cancel')}
                variant="ghost"
                onPress={() => setModalOpen(false)}
                disabled={submitting}
                style={styles.modalButton}
              />
              <Button
                label={t('friends.add')}
                onPress={addFriend}
                loading={submitting}
                style={styles.modalButton}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: layout.statusBarPad + 4,
    paddingBottom: 14,
    paddingHorizontal: 20,
  },
  listContent: {
    flexGrow: 1,
    paddingBottom: 20,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  myAvatar: {
    width: 56,
    height: 56,
    borderRadius: 21,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileInfo: {
    marginLeft: 14,
  },
  profileStatus: {
    marginTop: 3,
  },
  divider: {
    height: 1,
    backgroundColor: colors.hairline,
    marginHorizontal: 20,
    marginTop: 8,
  },
  sectionLabel: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 4,
  },
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  friendAvatar: {
    width: 44,
    height: 44,
    borderRadius: 17,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  friendName: {
    marginLeft: 14,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    textAlign: 'center',
    lineHeight: 20,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  modalCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: colors.background,
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 16,
  },
  modalInput: {
    borderBottomWidth: 1,
    borderBottomColor: colors.ink,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.textPrimary,
    marginTop: 14,
  },
  modalError: {
    marginTop: 8,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 4,
    marginTop: 16,
  },
  modalButton: {
    height: 44,
    minWidth: 88,
  },
});
