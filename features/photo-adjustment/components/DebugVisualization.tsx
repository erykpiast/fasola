import { useDebugContext } from "@/features/photo-adjustment/context/DebugContext";
import type { DewarpDebugData } from "@/lib/photo-processor/types";
import { useState, type JSX } from "react";
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

type TabName = "preprocessing" | "optimization" | "remapping" | "metrics";

/**
 * Debug visualization with multi-phase data display.
 * Shows preprocessing, optimization, and remapping results.
 */
export function DebugVisualization(props: {
  width: number;
}): JSX.Element | null {
  const { width } = props;
  const { debugData } = useDebugContext();
  const [selectedTab, setSelectedTab] = useState<TabName>("preprocessing");

  if (!debugData) {
    return null;
  }

  const dewarpData = debugData as DewarpDebugData;

  return (
    <View style={styles.container} pointerEvents="box-none">
      <View style={styles.tabBar}>
        <Tab
          name="preprocessing"
          label="Preprocessing"
          selectedTab={selectedTab}
          onPress={() => setSelectedTab("preprocessing")}
        />
        <Tab
          name="optimization"
          label="Optimization"
          selectedTab={selectedTab}
          onPress={() => setSelectedTab("optimization")}
        />
        <Tab
          name="remapping"
          label="Remapping"
          selectedTab={selectedTab}
          onPress={() => setSelectedTab("remapping")}
        />
        <Tab
          name="metrics"
          label="Metrics"
          selectedTab={selectedTab}
          onPress={() => setSelectedTab("metrics")}
        />
      </View>

      <ScrollView style={styles.content}>
        <TabContent name="preprocessing" selectedTab={selectedTab}>
          <PreprocessingTab dewarpData={dewarpData} width={width} />
        </TabContent>
        <TabContent name="optimization" selectedTab={selectedTab}>
          <OptimizationTab dewarpData={dewarpData} width={width} />
        </TabContent>
        <TabContent name="remapping" selectedTab={selectedTab}>
          <RemappingTab dewarpData={dewarpData} width={width} />
        </TabContent>
        <TabContent name="metrics" selectedTab={selectedTab}>
          <MetricsTab dewarpData={dewarpData} width={width} />
        </TabContent>
      </ScrollView>
    </View>
  );
}

function Tab(props: {
  name: TabName;
  label: string;
  selectedTab: TabName;
  onPress: () => void;
}): JSX.Element {
  const isActive = props.selectedTab === props.name;

  return (
    <TouchableOpacity
      style={[styles.tab, isActive && styles.tabActive]}
      onPress={props.onPress}
    >
      <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
        {props.label}
      </Text>
    </TouchableOpacity>
  );
}

function TabContent(props: {
  name: TabName;
  selectedTab: TabName;
  children: JSX.Element;
}): JSX.Element | null {
  if (props.selectedTab !== props.name) {
    return null;
  }

  return props.children;
}

function PreprocessingTab(props: {
  dewarpData: DewarpDebugData;
  width: number;
}): JSX.Element {
  const { dewarpData, width } = props;

  return (
    <View style={styles.section}>
      {dewarpData.binaryText && (
        <DebugImage
          uri={dewarpData.binaryText}
          label="Binary Text"
          width={width}
        />
      )}
      {dewarpData.edgeMap && (
        <DebugImage uri={dewarpData.edgeMap} label="Edge Map" width={width} />
      )}
      {dewarpData.detectedLines && (
        <DebugImage
          uri={dewarpData.detectedLines}
          label="Detected Lines"
          width={width}
        />
      )}
      {dewarpData.pageBoundary && (
        <DebugImage
          uri={dewarpData.pageBoundary}
          label="Page Boundary"
          width={width}
        />
      )}
      {dewarpData.preprocessingStats && (
        <View style={styles.statsBox}>
          <Text style={styles.statsText}>
            Contours: {dewarpData.preprocessingStats.contoursFound}
          </Text>
          <Text style={styles.statsText}>
            Lines: {dewarpData.preprocessingStats.linesDetected}
          </Text>
          <Text style={styles.statsText}>
            Page Size: {dewarpData.preprocessingStats.pageBounds.width} x{" "}
            {dewarpData.preprocessingStats.pageBounds.height}
          </Text>
        </View>
      )}
    </View>
  );
}

function OptimizationTab(props: {
  dewarpData: DewarpDebugData;
  width: number;
}): JSX.Element {
  const { dewarpData, width } = props;

  return (
    <View style={styles.section}>
      {dewarpData.detectedSpans && (
        <DebugImage
          uri={dewarpData.detectedSpans}
          label="Detected Spans"
          width={width}
        />
      )}
      {dewarpData.keypointCloud && (
        <DebugImage
          uri={dewarpData.keypointCloud}
          label="Keypoint Cloud"
          width={width}
        />
      )}
      {dewarpData.optimizationMetrics && (
        <View style={styles.statsBox}>
          <Text style={styles.statsText}>
            Span Iterations: {dewarpData.optimizationMetrics.spanIterations}
          </Text>
          <Text style={styles.statsText}>
            Span Error: {dewarpData.optimizationMetrics.spanError.toFixed(4)}
          </Text>
          <Text style={styles.statsText}>
            Model Iterations: {dewarpData.optimizationMetrics.modelIterations}
          </Text>
          <Text style={styles.statsText}>
            Model Error: {dewarpData.optimizationMetrics.modelError.toFixed(4)}
          </Text>
          <Text style={styles.statsText}>
            Parameters: {dewarpData.optimizationMetrics.parameters.length}{" "}
            coefficients
          </Text>
        </View>
      )}
    </View>
  );
}

function RemappingTab(props: {
  dewarpData: DewarpDebugData;
  width: number;
}): JSX.Element {
  const { dewarpData, width } = props;

  return (
    <View style={styles.section}>
      {dewarpData.meshGrid && (
        <DebugImage
          uri={dewarpData.meshGrid}
          label="Mesh Grid (Warp Field)"
          width={width}
        />
      )}
      {dewarpData.surfaceMesh && (
        <DebugImage
          uri={dewarpData.surfaceMesh}
          label="3D Surface Mesh"
          width={width}
        />
      )}
      {dewarpData.beforeAfter && (
        <DebugImage
          uri={dewarpData.beforeAfter}
          label="Before/After Comparison"
          width={width * 2}
        />
      )}
      {dewarpData.remapStats && (
        <View style={styles.statsBox}>
          <Text style={styles.statsText}>
            Output Resolution: {dewarpData.remapStats.resolution.width} x{" "}
            {dewarpData.remapStats.resolution.height}
          </Text>
          <Text style={styles.statsText}>
            Interpolation: {dewarpData.remapStats.interpolation}
          </Text>
        </View>
      )}
    </View>
  );
}

function MetricsTab(props: {
  dewarpData: DewarpDebugData;
  width: number;
}): JSX.Element {
  const { dewarpData } = props;

  return (
    <View style={styles.section}>
      <View style={styles.statsBox}>
        <Text style={styles.statsHeader}>Processing Performance</Text>
        <Text style={styles.statsText}>
          Total Time: {dewarpData.processingTime}ms
        </Text>

        {dewarpData.mathValidation && (
          <>
            <Text style={styles.statsHeader}>Math Validation</Text>
            <Text style={styles.statsText}>
              Polynomial Test:{" "}
              {dewarpData.mathValidation.polynomialTest ? "✓" : "✗"}
            </Text>
            <Text style={styles.statsText}>
              Projection Test:{" "}
              {dewarpData.mathValidation.projectionTest ? "✓" : "✗"}
            </Text>
          </>
        )}

        {dewarpData.progressLog && dewarpData.progressLog.length > 0 && (
          <>
            <Text style={styles.statsHeader}>Processing Timeline</Text>
            {dewarpData.progressLog.map((log, index) => (
              <Text key={index} style={styles.statsSmall}>
                {log.timestamp}ms - {log.phase}: {log.message}
              </Text>
            ))}
          </>
        )}
      </View>
    </View>
  );
}

/**
 * Display a single debug image with label.
 */
function DebugImage(props: {
  uri: string;
  label: string;
  width: number;
}): JSX.Element {
  return (
    <View style={styles.debugImageContainer}>
      <Text style={styles.debugLabel}>{props.label}</Text>
      <Image
        source={{ uri: props.uri }}
        style={{ width: props.width, height: props.width * 0.75 }}
        resizeMode="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.9)",
  },
  tabBar: {
    flexDirection: "row",
    backgroundColor: "rgba(0, 0, 0, 0.95)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.2)",
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: "center",
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: "#00ffff",
  },
  tabText: {
    color: "rgba(255, 255, 255, 0.6)",
    fontSize: 12,
    fontWeight: "500",
  },
  tabTextActive: {
    color: "#00ffff",
  },
  content: {
    flex: 1,
  },
  section: {
    padding: 16,
  },
  debugImageContainer: {
    marginBottom: 24,
  },
  debugLabel: {
    color: "#00ffff",
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
  },
  statsBox: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
  },
  statsHeader: {
    color: "#00ffff",
    fontSize: 14,
    fontWeight: "700",
    marginTop: 12,
    marginBottom: 6,
  },
  statsText: {
    color: "rgba(255, 255, 255, 0.9)",
    fontSize: 13,
    marginVertical: 2,
  },
  statsSmall: {
    color: "rgba(255, 255, 255, 0.7)",
    fontSize: 11,
    marginVertical: 1,
    fontFamily: "monospace",
  },
});
