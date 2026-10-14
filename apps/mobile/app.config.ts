import type { ConfigContext, ExpoConfig } from 'expo/config';
export default function configuration({ config }: ConfigContext): ExpoConfig {
  const domain = process.env.EXPO_PUBLIC_AUTH0_DOMAIN;
  const scheme = process.env.EXPO_PUBLIC_AUTH0_SCHEME;
  const iosId = process.env.MOBILE_IOS_BUNDLE_IDENTIFIER;
  const androidId = process.env.MOBILE_ANDROID_PACKAGE;
  const supplied = [domain, scheme, iosId, androidId].filter(Boolean).length;
  if (supplied > 0 && supplied < 4)
    throw new Error(
      'Provide Auth0 domain, scheme and both native application identifiers together',
    );
  return {
    ...config,
    name: config.name ?? 'Rental Management',
    slug: config.slug ?? 'rental-management',
    ...(domain && scheme && iosId && androidId
      ? {
          scheme,
          ios: { ...config.ios, bundleIdentifier: iosId },
          android: { ...config.android, package: androidId },
          plugins: [
            ...(config.plugins ?? []),
            ['react-native-auth0', { domain, customScheme: scheme }],
          ],
        }
      : {}),
  };
}
