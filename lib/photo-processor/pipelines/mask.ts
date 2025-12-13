import { Config } from "./config";
import { getContours, type ContourInfo } from "./contours";

interface Mat {
  clone(): Mat;
  delete(): void;
  isDeleted(): boolean;
}

interface Size {
  new (width: number, height: number): Size;
}

interface Point {
  new (x: number, y: number): Point;
}

interface CV {
  Mat: new () => Mat;
  MatVector: new () => MatVector;
  Size: Size;
  Point: Point;
  getStructuringElement(shape: number, ksize: Size): Mat;
  cvtColor(src: Mat, dst: Mat, code: number): void;
  adaptiveThreshold(
    src: Mat,
    dst: Mat,
    maxValue: number,
    adaptiveMethod: number,
    thresholdType: number,
    blockSize: number,
    C: number
  ): void;
  dilate(src: Mat, dst: Mat, kernel: Mat): void;
  erode(src: Mat, dst: Mat, kernel: Mat, anchor?: Point, iterations?: number): void;
  bitwise_and(src1: Mat, src2: Mat, dst: Mat): void;
  MORPH_RECT: number;
  COLOR_RGB2GRAY: number;
  ADAPTIVE_THRESH_MEAN_C: number;
  THRESH_BINARY_INV: number;
}

interface MatVector {
  push_back(mat: Mat): void;
  size(): number;
  get(index: number): Mat;
  delete(): void;
}

/**
 * Creates a rectangular structuring element for morphological operations.
 */
export function box(cv: CV, width: number, height: number): Mat {
  return cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(width, height));
}

/**
 * Generates a binary text mask using adaptive thresholding and morphology.
 */
export class Mask {
  private cv: CV;
  private name: string;
  private small: Mat;
  private pagemask: Mat;
  private text: boolean;
  public value: Mat | null = null;

  constructor(cv: CV, name: string, small: Mat, pagemask: Mat, text = true) {
    this.cv = cv;
    this.name = name;
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
    return getContours(this.cv, this.name, this.small, this.value);
  }

  destroy(): void {
    if (this.value && !this.value.isDeleted()) {
      this.value.delete();
    }
  }
}

