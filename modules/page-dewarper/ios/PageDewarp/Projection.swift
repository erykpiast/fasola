// Projection.swift
// Ported from src/page_dewarp/projection.py

import Foundation

/// Projects normalized (x, y) coordinates through a cubic warp surface model into image space.
///
/// Builds a cubic polynomial z(x) = ((a·x + b)·x + c)·x from pvec's cubic coefficients,
/// then projects (x, y, z) 3D points into 2D image coordinates using pure-Swift projection.
///
/// Ported from projection.py:19-57
///
/// - Parameters:
///   - xyCoords: An (N, 2) array of normalized (x, y) points.
///   - pvec: The full parameter vector — rvec at [0..<3], tvec at [3..<6], cubic at [6..<8].
/// - Returns: An (N, 2) array of projected 2D image points.
func projectXY(xyCoords: [[Double]], pvec: [Double]) -> [[Double]] {
    let alpha = max(-0.5, min(0.5, pvec[DewarpConfig.cubicIdx.lowerBound]))
    let beta = max(-0.5, min(0.5, pvec[DewarpConfig.cubicIdx.lowerBound + 1]))

    let a = alpha + beta
    let b = -2 * alpha - beta
    let c = alpha

    guard !xyCoords.isEmpty else { return [] }

    // Build flat array of 3D points [x0,y0,z0, x1,y1,z1, ...]
    var points3DFlat: [Double] = []
    points3DFlat.reserveCapacity(xyCoords.count * 3)
    for xy in xyCoords {
        let x = xy[0]
        let z = ((a * x + b) * x + c) * x
        points3DFlat.append(xy[0])
        points3DFlat.append(xy[1])
        points3DFlat.append(z)
    }

    let rvec = Array(pvec[DewarpConfig.rvecIdx])
    let tvec = Array(pvec[DewarpConfig.tvecIdx])

    // Project using pure-Swift implementation (same math as OpenCV projectPoints
    // with K = diag(f,f,1) and zero distortion)
    let result = projectAndDifferentiate(
        points3D: points3DFlat,
        rvec: rvec,
        tvec: tvec,
        focalLength: DewarpConfig.focalLength
    )

    // Convert flat [u0,v0, u1,v1, ...] back to [[u,v], ...]
    let nPoints = xyCoords.count
    var projected: [[Double]] = []
    projected.reserveCapacity(nPoints)
    for i in 0..<nPoints {
        projected.append([result.projected[i*2], result.projected[i*2+1]])
    }
    return projected
}
