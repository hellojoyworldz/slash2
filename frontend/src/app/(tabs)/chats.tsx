import { useRouter } from 'expo-router';
import { useAuth } from '../../auth';
import { ChatsScreen } from '../../screens/ChatsScreen';

export default function ChatsRoute() {
  const { token, email, displayName, logout } = useAuth();
  const router = useRouter();
  return (
    <ChatsScreen
      token={token}
      email={email}
      displayName={displayName}
      onOpenChat={() => router.push('/chat')}
      onOpenFriend={(friend) =>
        router.push({
          pathname: '/chat',
          params: { friendId: friend.id, name: friend.name },
        })
      }
      onLogout={async () => {
        await logout();
        router.replace('/login');
      }}
    />
  );
}
