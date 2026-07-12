import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { api, ApiError, Friend } from '../api';
import { colors, layout } from '../theme';

interface Props {
  token: string | null;
  email: string;
  onOpenChat: () => void;
  onOpenFriend: (friend: Friend) => void;
  onLogout: () => void;
}

// Alert.alert는 웹에서 동작하지 않아서 웹은 confirm으로 대체한다.
function confirmDelete(name: string, onConfirm: () => void) {
  if (Platform.OS === 'web') {
    if (window.confirm(`'${name}' 친구를 삭제할까요?`)) onConfirm();
    return;
  }
  Alert.alert('삭제', `'${name}' 친구를 삭제할까요?`, [
    { text: '취소', style: 'cancel' },
    { text: '삭제', style: 'destructive', onPress: onConfirm },
  ]);
}

export function FriendsScreen({
  token,
  email,
  onOpenChat,
  onOpenFriend,
  onLogout,
}: Props) {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const myName = email.split('@')[0] || '나';

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
      setFormError('이름을 입력해주세요.');
      return;
    }
    if (!token) {
      setFormError('로그인 후 추가할 수 있어요.');
      return;
    }
    setSubmitting(true);
    setFormError('');
    try {
      const friend = await api.createFriend(token, name);
      setFriends((prev) =>
        [...prev, friend].sort((a, b) => a.name.localeCompare(b.name, 'ko')),
      );
      setModalOpen(false);
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : '추가하지 못했어요. 다시 시도해주세요.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const removeFriend = (friend: Friend) => {
    if (!token) return;
    confirmDelete(friend.name, async () => {
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
        <Text style={styles.headerTitle}>친구</Text>
        <TouchableOpacity onPress={openModal} hitSlop={{ top: 8, bottom: 8, left: 8 }}>
          <Text style={styles.headerAction}>추가</Text>
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
            >
              <View style={styles.myAvatar}>
                <Text style={styles.myAvatarText}>
                  {myName.charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={styles.profileInfo}>
                <Text style={styles.profileName}>{myName}</Text>
                <Text style={styles.profileStatus}>나에게 메시지 보내기</Text>
              </View>
            </TouchableOpacity>

            <View style={styles.divider} />
            <Text style={styles.sectionLabel}>친구 {friends.length}</Text>
          </>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.friendRow}
            activeOpacity={0.6}
            onPress={() => onOpenFriend(item)}
            onLongPress={() => removeFriend(item)}
          >
            <View style={styles.friendAvatar}>
              <Text style={styles.friendAvatarText}>
                {item.name.charAt(0).toUpperCase()}
              </Text>
            </View>
            <Text style={styles.friendName}>{item.name}</Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              오른쪽 위 '추가'를 눌러{'\n'}첫 친구를 만들어보세요
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
            <Text style={styles.modalTitle}>친구 추가</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="이름 (예: 개발, 요리, 뉴스)"
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
            {formError ? <Text style={styles.modalError}>{formError}</Text> : null}
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => setModalOpen(false)}
                disabled={submitting}
              >
                <Text style={styles.modalCancelText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSubmit, submitting && styles.modalSubmitDisabled]}
                onPress={addFriend}
                disabled={submitting}
                activeOpacity={0.85}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color={colors.inverse} />
                ) : (
                  <Text style={styles.modalSubmitText}>추가</Text>
                )}
              </TouchableOpacity>
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
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.5,
    color: colors.textPrimary,
  },
  headerAction: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.ink,
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
  myAvatarText: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.inverse,
  },
  profileInfo: {
    marginLeft: 14,
  },
  profileName: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.3,
    color: colors.textPrimary,
  },
  profileStatus: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 3,
  },
  divider: {
    height: 1,
    backgroundColor: colors.hairline,
    marginHorizontal: 20,
    marginTop: 8,
  },
  sectionLabel: {
    fontSize: 12,
    color: colors.textTertiary,
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
  friendAvatarText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.ink,
  },
  friendName: {
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: -0.2,
    color: colors.textPrimary,
    marginLeft: 14,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 13,
    color: colors.textTertiary,
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
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.3,
    color: colors.textPrimary,
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
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 8,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: 20,
  },
  modalCancel: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  modalCancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  modalSubmit: {
    backgroundColor: colors.ink,
    borderRadius: 10,
    paddingHorizontal: 22,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
    minWidth: 72,
  },
  modalSubmitDisabled: {
    opacity: 0.5,
  },
  modalSubmitText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.inverse,
  },
});
