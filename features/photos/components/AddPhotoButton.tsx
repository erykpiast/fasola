import { Pressable, Text, StyleSheet, ActionSheetIOS, Platform, Alert } from 'react-native';
import * as Haptics from 'expo-haptics';
import { GlassView } from 'expo-glass-effect';
import { useTranslation } from '../../../platform/i18n/useTranslation';
import { useTheme } from '../../../platform/theme/useTheme';
import { getColors } from '../../../platform/theme/glassStyles';

interface AddPhotoButtonProps {
  onCamera: () => void;
  onLibrary: () => void;
}

export function AddPhotoButton({ onCamera, onLibrary }: AddPhotoButtonProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const colors = getColors(theme);

  const handlePress = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [
            t('addPhoto.camera'),
            t('addPhoto.library'),
            'Cancel'
          ],
          cancelButtonIndex: 2,
        },
        (buttonIndex) => {
          if (buttonIndex === 0) {
            onCamera();
          } else if (buttonIndex === 1) {
            onLibrary();
          }
        }
      );
    } else {
      Alert.alert(
        t('addPhoto.button'),
        '',
        [
          { text: t('addPhoto.camera'), onPress: onCamera },
          { text: t('addPhoto.library'), onPress: onLibrary },
          { text: 'Cancel', style: 'cancel' },
        ]
      );
    }
  };

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.container,
        { opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <GlassView
        style={styles.glass}
        blurIntensity={20}
        tint={theme}
      >
        <Text style={[styles.text, { color: colors.text }]}>+</Text>
      </GlassView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 32,
    alignSelf: 'center',
  },
  glass: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  text: {
    fontSize: 32,
    fontWeight: '300',
  },
});
