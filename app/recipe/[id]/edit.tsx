import { type JSX } from "react";
import { View, Text, StyleSheet } from "react-native";

export default function EditRecipeScreen(): JSX.Element {
  return (
    <View style={styles.container}>
      <Text>Edit Recipe (Coming Soon)</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
});
