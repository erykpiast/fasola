import { View, StyleSheet, Alert } from "react-native";
import { Suspense } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { useTheme } from "../platform/theme/useTheme";
import { getColors } from "../platform/theme/glassStyles";
import { usePhotos } from "../features/photos/hooks/usePhotos";
import { usePhotoImport } from "../features/photos/hooks/usePhotoImport";
import { PhotoGrid } from "../features/photos/components/PhotoGrid";
import { AddPhotoButton } from "../features/photos/components/AddPhotoButton";
import { EmptyState } from "../features/photos/components/EmptyState";
import { useTranslation } from "../platform/i18n/useTranslation";

function ErrorFallback() {
  return <View style={{ flex: 1 }} />;
}

function Content() {
  const { t } = useTranslation();
  const theme = useTheme();
  const colors = getColors(theme);
  const { photos, addPhoto } = usePhotos();
  const { importFromCamera, importFromLibrary } = usePhotoImport();

  const handleCamera = async () => {
    const uri = await importFromCamera();
    if (uri) {
      await addPhoto(uri);
    }
  };

  const handleLibrary = async () => {
    const uri = await importFromLibrary();
    if (uri) {
      await addPhoto(uri);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {photos.length === 0 ? (
        <EmptyState />
      ) : (
        <PhotoGrid photos={photos} />
      )}
      <AddPhotoButton onCamera={handleCamera} onLibrary={handleLibrary} />
    </View>
  );
}

export default function Index() {
  return (
    <ErrorBoundary fallback={<ErrorFallback />}>
      <Suspense fallback={<View style={{ flex: 1 }} />}>
        <Content />
      </Suspense>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
