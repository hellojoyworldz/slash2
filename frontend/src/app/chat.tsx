import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../auth';
import { ChatScreen } from '../screens/ChatScreen';

export default function ChatRoute() {
  const { token, email, logout } = useAuth();
  const router = useRouter();
  // /chat → 나에게 방, /chat?friendId=..&name=.. → 친구 방
  const params = useLocalSearchParams<{ friendId?: string; name?: string }>();
  const friendId = typeof params.friendId === 'string' ? params.friendId : null;
  const friendName = typeof params.name === 'string' ? params.name : null;

  return (
    <ChatScreen
      token={token}
      email={email}
      friendId={friendId}
      friendName={friendName}
      onBack={() => {
        // URL로 바로 들어온 경우 뒤로 갈 곳이 없으니 채팅 탭으로
        if (router.canGoBack()) router.back();
        else router.replace('/chats');
      }}
      onLogout={async () => {
        await logout();
        router.replace('/login');
      }}
    />
  );
}
