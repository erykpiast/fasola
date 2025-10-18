import { Suspense } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { StyleSheet, View } from "react-native";
import { AddPhotoButton } from "../features/photos/components/AddPhotoButton";
import { EmptyState } from "../features/photos/components/EmptyState";
import { PhotoGrid } from "../features/photos/components/PhotoGrid";
import { usePhotos } from "../features/photos/hooks/usePhotos";
import { getColors } from "../platform/theme/glassStyles";
import { useTheme } from "../platform/theme/useTheme";

function ErrorFallback() {
  return <View style={{ flex: 1 }} />;
}

function Content() {
  const theme = useTheme();
  const colors = getColors(theme);
  const { photos, addPhoto } = usePhotos();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {photos.length === 0 ? <EmptyState /> : <PhotoGrid photos={photos} />}
      <AddPhotoButton onPhotoSelected={addPhoto} />
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
