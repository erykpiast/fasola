import { FlatList, StyleSheet, Dimensions, View } from 'react-native';
import { Image } from 'expo-image';
import { Photo } from '../types';
import { ErrorBoundary } from 'react-error-boundary';
import { Suspense } from 'react';

const { width } = Dimensions.get('window');
const COLUMNS = 3;
const SPACING = 2;
const ITEM_SIZE = (width - (COLUMNS - 1) * SPACING) / COLUMNS;

interface PhotoGridProps {
  photos: Photo[];
}

function PhotoItem({ photo }: { photo: Photo }) {
  return (
    <ErrorBoundary fallback={<View style={styles.item} />}>
      <Suspense fallback={<View style={styles.item} />}>
        <Image
          source={{ uri: photo.uri }}
          style={styles.item}
          contentFit="cover"
          transition={200}
        />
      </Suspense>
    </ErrorBoundary>
  );
}

export function PhotoGrid({ photos }: PhotoGridProps) {
  return (
    <FlatList
      data={photos}
      renderItem={({ item }) => <PhotoItem photo={item} />}
      keyExtractor={(item) => item.id}
      numColumns={COLUMNS}
      columnWrapperStyle={styles.row}
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: 120,
  },
  row: {
    gap: SPACING,
    marginBottom: SPACING,
  },
  item: {
    width: ITEM_SIZE,
    height: ITEM_SIZE,
    backgroundColor: 'rgba(128, 128, 128, 0.1)',
  },
});
