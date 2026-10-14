import { useState } from 'react';
import { Button, Text, TextInput, View } from 'react-native';
import { Auth0Provider, useAuth0 } from 'react-native-auth0';
import { translate } from '@rental/i18n';

const domain = process.env.EXPO_PUBLIC_AUTH0_DOMAIN;
const clientId = process.env.EXPO_PUBLIC_AUTH0_CLIENT_ID;
const audience = process.env.EXPO_PUBLIC_AUTH0_AUDIENCE;
const scheme = process.env.EXPO_PUBLIC_AUTH0_SCHEME;
const api = process.env.EXPO_PUBLIC_API_BASE_URL;

function Account() {
  const { authorize, clearSession, clearCredentials, getCredentials, user } =
    useAuth0();
  const [token, setToken] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function perform(action: 'login' | 'logout' | 'me' | 'accept') {
    setBusy(true);
    try {
      if (action === 'login')
        await authorize(
          { audience: audience!, scope: 'openid profile email offline_access' },
          { customScheme: scheme! },
        );
      else if (action === 'logout') {
        try {
          await clearSession({}, { customScheme: scheme! });
        } finally {
          await clearCredentials();
        }
      } else {
        const credentials = await getCredentials();
        const response = await fetch(
          `${api}/${action === 'me' ? 'me' : 'invitations/accept'}`,
          {
            method: action === 'me' ? 'GET' : 'POST',
            headers: {
              authorization: `Bearer ${credentials.accessToken}`,
              'content-type': 'application/json',
            },
            ...(action === 'accept' ? { body: JSON.stringify({ token }) } : {}),
          },
        );
        if (!response.ok) throw new Error('API request failed');
        if (action === 'accept') setToken('');
      }
      setMessage(translate('en', 'auth.success'));
    } catch {
      setMessage(translate('en', 'auth.failed'));
    } finally {
      setBusy(false);
    }
  }
  return (
    <View style={{ padding: 24, paddingTop: 80, gap: 16 }}>
      <Text>{translate('en', 'app.title')}</Text>
      <Text>{user?.name}</Text>
      <Button
        disabled={busy}
        title={translate('en', 'auth.login')}
        onPress={() => void perform('login')}
      />
      <Button
        disabled={busy}
        title={translate('en', 'auth.logout')}
        onPress={() => void perform('logout')}
      />
      <Button
        disabled={busy}
        title={translate('en', 'auth.currentUser')}
        onPress={() => void perform('me')}
      />
      <TextInput
        accessibilityLabel={translate('en', 'auth.invitation')}
        placeholder={translate('en', 'auth.invitation')}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        value={token}
        onChangeText={setToken}
      />
      <Button
        disabled={busy || !token}
        title={translate('en', 'auth.accept')}
        onPress={() => void perform('accept')}
      />
      <Text accessibilityLiveRegion="polite">{message}</Text>
    </View>
  );
}
export default function App() {
  if (!domain || !clientId || !audience || !scheme || !api)
    return (
      <View style={{ padding: 48 }}>
        <Text>{translate('en', 'auth.configurationRequired')}</Text>
      </View>
    );
  return (
    <Auth0Provider domain={domain} clientId={clientId}>
      <Account />
    </Auth0Provider>
  );
}
