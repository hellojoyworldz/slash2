import { useRouter } from 'expo-router';
import { useAuth } from '../../auth';
import { MoreScreen } from '../../screens/MoreScreen';

export default function MoreRoute() {
  const { email, displayName, providers, logout } = useAuth();
  const router = useRouter();
  return (
    <MoreScreen
      email={email}
      displayName={displayName}
      providers={providers}
      onLogout={async () => {
        await logout();
        router.replace('/login');
      }}
    />
  );
}
