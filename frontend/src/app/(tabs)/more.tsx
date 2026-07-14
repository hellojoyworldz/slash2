import { useRouter } from 'expo-router';
import { api } from '../../api';
import { useAuth } from '../../auth';
import { MoreScreen } from '../../screens/MoreScreen';

export default function MoreRoute() {
  const { token, email, displayName, logout, setDisplayName } = useAuth();
  const router = useRouter();
  return (
    <MoreScreen
      email={email}
      displayName={displayName}
      onRename={async (name) => {
        if (!token) return;
        const user = await api.updateProfile(token, name);
        setDisplayName(user.displayName ?? null);
      }}
      onLogout={async () => {
        await logout();
        router.replace('/login');
      }}
    />
  );
}
