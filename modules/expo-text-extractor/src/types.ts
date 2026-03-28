export interface BoundingBox {
  /** Left edge, normalized 0-1, top-left origin */
  x: number;
  /** Top edge, normalized 0-1, top-left origin */
  y: number;
  /** Width, normalized 0-1 */
  width: number;
  /** Height, normalized 0-1 */
  height: number;
}

export interface TextObservation {
  text: string;
  confidence: number;
  bounds: BoundingBox;
}
