declare module "@techstark/opencv-js" {
  export interface Mat {
    rows: number;
    cols: number;
    channels(): number;
    data: Uint8Array;
    data32S: Int32Array;
    data32F: Float32Array;
    clone(): Mat;
    delete(): void;
    isDeleted(): boolean;
    copyTo(dst: Mat): void;
    floatPtr(row: number, col: number): Float32Array;
    intPtr(row: number, col: number): Int32Array;
    doubleAt(row: number, col: number): number;
    create(rows: number, cols: number, type: number): void;
  }
}
