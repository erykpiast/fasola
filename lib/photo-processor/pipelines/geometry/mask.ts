import type { CV, CVMat } from "../../types/opencv";
import { Config } from "./config";
import { getContours, type ContourInfo } from "./contours";

/**
 * Creates a rectangular structuring element for morphological operations.
 */
export function box(cv: CV, width: number, height: number): CVMat {
  return cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(width, height));
}

/**
 * Generates a binary text mask using adaptive thresholding and morphology.
 */
export class Mask {
  private cv: CV;
  private small: CVMat;
  private pagemask: CVMat;
  private text: boolean;
  public value: CVMat | null = null;

  constructor(cv: CV, _name: string, small: CVMat, pagemask: CVMat, text = true) {
    this.cv = cv;
    this.small = small;
    this.pagemask = pagemask;
    this.text = text;

    this.calculate();
  }

  private calculate(): void {
    const sgray = new this.cv.Mat();
    this.cv.cvtColor(this.small, sgray, this.cv.COLOR_RGB2GRAY);

    let mask = new this.cv.Mat();
    this.cv.adaptiveThreshold(
      sgray,
      mask,
      255,
      this.cv.ADAPTIVE_THRESH_MEAN_C,
      this.cv.THRESH_BINARY_INV,
      Config.ADAPTIVE_WINSZ,
      this.text ? 25 : 7
    );

    if (this.text) {
      const kernel = box(this.cv, 9, 1);
      const dilated = new this.cv.Mat();
      this.cv.dilate(mask, dilated, kernel);
      kernel.delete();
      mask.delete();
      mask = dilated;

      const kernel2 = box(this.cv, 1, 3);
      const eroded = new this.cv.Mat();
      this.cv.erode(mask, eroded, kernel2);
      kernel2.delete();
      mask.delete();
      mask = eroded;
    } else {
      const kernel = box(this.cv, 3, 1);
      const eroded = new this.cv.Mat();
      this.cv.erode(mask, eroded, kernel, new this.cv.Point(-1, -1), 3);
      kernel.delete();
      mask.delete();
      mask = eroded;

      const kernel2 = box(this.cv, 8, 2);
      const dilated = new this.cv.Mat();
      this.cv.dilate(mask, dilated, kernel2);
      kernel2.delete();
      mask.delete();
      mask = dilated;
    }

    const finalMask = new this.cv.Mat();
    this.cv.bitwise_and(mask, this.pagemask, finalMask);

    mask.delete();
    sgray.delete();

    this.value = finalMask;
  }

  contours(): Array<ContourInfo> {
    if (!this.value) {
      return [];
    }
    return getContours(this.cv, this.value);
  }

  destroy(): void {
    if (this.value && !this.value.isDeleted()) {
      this.value.delete();
    }
  }
}

