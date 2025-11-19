/**
 * Default configuration for page dewarping.
 */
export const DEFAULT_DEWARP_CONFIG: {
  preprocessing: {
    adaptiveThresholdBlockSize: number;
    textMinWidth: number;
    textMinHeight: number;
    textMinAspect: number;
    textMaxThickness: number;
    pageMinAreaRatio: number;
    pageMinAspectRatio: number;
    pageMaxAspectRatio: number;
  };
  spanDetection: {
    numSpans: number;
    spanSpacing: number;
  };
  modelFitting: {
    maxIterations: number;
    tolerance: number;
  };
  output: {
    width: number;
    height: number;
    adaptiveThreshold: boolean;
  };
} = {
  preprocessing: {
    adaptiveThresholdBlockSize: 51,
    textMinWidth: 200,
    textMinHeight: 10,
    textMinAspect: 1.5,
    textMaxThickness: 40,
    pageMinAreaRatio: 0.6,
    pageMinAspectRatio: 1.2,
    pageMaxAspectRatio: 1.9,
  },
  spanDetection: {
    numSpans: 10,
    spanSpacing: 50,
  },
  modelFitting: {
    maxIterations: 100,
    tolerance: 0.001,
  },
  output: {
    width: 1200,
    height: 1600,
    adaptiveThreshold: false,
  },
};
