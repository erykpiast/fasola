// Solver.swift
// Ported from src/page_dewarp/solve.py

import Foundation
#if SWIFT_PACKAGE
import OpenCVBridge
#endif

/// Errors produced by the solver.
enum SolverError: Error {
    case solvePnPFailed
}

/// Assembles an initial parameter vector for page flattening.
///
/// Uses four corner correspondences to estimate rotation/translation,
/// then concatenates rvec, tvec, cubic slopes, ycoords, and per-span xcoords.
///
/// Ported from solve.py:19-63
func getDefaultParams(
    corners: [[Double]],
    ycoords: [Double],
    xcoords: [[Double]]
) -> Result<(pageDims: (Double, Double), spanCounts: [Int], params: [Double]), SolverError> {
    let pageWidth = euclideanNorm(corners[1], corners[0])
    let pageHeight = euclideanNorm(corners[3], corners[0])

    // 3D object points (flat page, z=0): TL, TR, BR, BL
    let objPts: [[Double]] = [
        [0, 0, 0],
        [pageWidth, 0, 0],
        [pageWidth, pageHeight, 0],
        [0, pageHeight, 0],
    ]
    // 2D image points (normalized coords)
    let imgPts = corners

    let f = DewarpConfig.focalLength

    guard let (rvecArr, tvecArr) = solvePnP4Coplanar(
        objectPoints: objPts, imagePoints: imgPts, focalLength: f
    ) else {
        return .failure(.solvePnPFailed)
    }

    let spanCounts = xcoords.map { $0.count }
    var params: [Double] = []
    params.append(contentsOf: rvecArr)
    params.append(contentsOf: tvecArr)
    params.append(contentsOf: [0.0, 0.0])
    params.append(contentsOf: ycoords)
    for xc in xcoords {
        params.append(contentsOf: xc)
    }

    return .success((pageDims: (pageWidth, pageHeight), spanCounts: spanCounts, params: params))
}

// MARK: - Pure-Swift solvePnP for 4 coplanar points

/// Solve PnP for 4 coplanar points (z=0) with K = diag(f,f,1) and zero distortion.
///
/// Uses homography decomposition: normalize image points by K⁻¹, compute homography H
/// from object XY to normalized image coords, then extract R and t from H.
private func solvePnP4Coplanar(
    objectPoints: [[Double]],
    imagePoints: [[Double]],
    focalLength: Double
) -> (rvec: [Double], tvec: [Double])? {
    // Normalize image points: p_normalized = K⁻¹ * p = [u/f, v/f, 1]
    let normImgPts = imagePoints.map { [$0[0] / focalLength, $0[1] / focalLength] }
    // Object points are XY only (z=0)
    let objXY = objectPoints.map { [$0[0], $0[1]] }

    // Compute homography H: objXY → normImgPts using DLT
    guard let H = computeHomography(from: objXY, to: normImgPts) else { return nil }

    // Extract R, t from H = [h1 h2 h3] where h1, h2 are first two columns
    // For coplanar case: [h1 h2 h3] = λ[r1 r2 t]
    let h1 = [H[0], H[3], H[6]]
    let h2 = [H[1], H[4], H[7]]
    let h3 = [H[2], H[5], H[8]]

    let norm1 = sqrt(h1[0]*h1[0] + h1[1]*h1[1] + h1[2]*h1[2])
    let norm2 = sqrt(h2[0]*h2[0] + h2[1]*h2[1] + h2[2]*h2[2])
    guard norm1 > 1e-10 && norm2 > 1e-10 else { return nil }

    let lambda = (norm1 + norm2) / 2.0

    // r1, r2 are the first two rotation matrix columns, t is translation
    let r1 = h1.map { $0 / lambda }
    let r2 = h2.map { $0 / lambda }
    let t = h3.map { $0 / lambda }

    // r3 = r1 × r2
    let r3 = cross(r1, r2)

    // Assemble R (may not be perfectly orthogonal due to noise)
    // Use polar decomposition to find nearest rotation matrix
    var R = [
        r1[0], r2[0], r3[0],
        r1[1], r2[1], r3[1],
        r1[2], r2[2], r3[2],
    ]
    R = nearestRotationMatrix(R)

    // Convert R to rvec via inverse Rodrigues
    let rvec = rotationMatrixToRvec(R)
    return (rvec, t)
}

/// Compute 3x3 homography from 4 point correspondences using DLT.
/// Points are 2D: from[i] = [x,y], to[i] = [u,v].
/// Returns 9-element flat array (row-major) or nil on failure.
private func computeHomography(from src: [[Double]], to dst: [[Double]]) -> [Double]? {
    guard src.count >= 4, dst.count >= 4 else { return nil }
    // Build 8x9 matrix A for DLT: for each correspondence, two rows
    var A = [[Double]](repeating: [Double](repeating: 0, count: 9), count: 8)
    for i in 0..<4 {
        let x = src[i][0], y = src[i][1]
        let u = dst[i][0], v = dst[i][1]
        A[2*i]   = [-x, -y, -1, 0, 0, 0, u*x, u*y, u]
        A[2*i+1] = [0, 0, 0, -x, -y, -1, v*x, v*y, v]
    }

    // Solve Ah = 0 via SVD: h is the last row of Vt (smallest singular value)
    // Use a simple 9x9 AᵀA approach
    var AtA = [Double](repeating: 0, count: 81)
    for i in 0..<9 {
        for j in 0..<9 {
            var sum = 0.0
            for k in 0..<8 { sum += A[k][i] * A[k][j] }
            AtA[i * 9 + j] = sum
        }
    }

    // Find eigenvector of smallest eigenvalue via power iteration on (maxλI - AᵀA)
    // For robustness, use the Jacobi eigenvalue algorithm for symmetric 9x9 matrix
    guard let h = smallestEigenvector9x9(AtA) else { return nil }
    return h
}

/// Find the eigenvector corresponding to the smallest eigenvalue of a symmetric 9x9 matrix.
/// Uses inverse power iteration with shift.
private func smallestEigenvector9x9(_ M: [Double]) -> [Double]? {
    let n = 9
    // Estimate max eigenvalue for shift using Gershgorin
    var maxEig = 0.0
    for i in 0..<n {
        var rowSum = 0.0
        for j in 0..<n { if i != j { rowSum += abs(M[i*n+j]) } }
        maxEig = max(maxEig, M[i*n+i] + rowSum)
    }

    // Power iteration on (maxEig*I - M) finds eigenvector of largest eigenvalue of shifted matrix
    // = eigenvector of smallest eigenvalue of M
    var shifted = M
    for i in 0..<n { shifted[i*n+i] = maxEig - M[i*n+i] }
    for i in 0..<n {
        for j in 0..<n {
            if i != j { shifted[i*n+j] = -M[i*n+j] }
        }
    }

    var v = [Double](repeating: 1.0 / 3.0, count: n)
    for _ in 0..<100 {
        var w = [Double](repeating: 0, count: n)
        for i in 0..<n {
            for j in 0..<n { w[i] += shifted[i*n+j] * v[j] }
        }
        let norm = sqrt(w.reduce(0) { $0 + $1 * $1 })
        if norm < 1e-15 { return nil }
        v = w.map { $0 / norm }
    }
    return v
}

/// Cross product of two 3-vectors.
private func cross(_ a: [Double], _ b: [Double]) -> [Double] {
    [a[1]*b[2] - a[2]*b[1], a[2]*b[0] - a[0]*b[2], a[0]*b[1] - a[1]*b[0]]
}

/// Find the nearest rotation matrix to a given 3x3 matrix using SVD polar decomposition.
/// R_nearest = U * Vᵀ where M = U * S * Vᵀ
private func nearestRotationMatrix(_ M: [Double]) -> [Double] {
    // Compute MᵀM
    var MtM = [Double](repeating: 0, count: 9)
    for i in 0..<3 {
        for j in 0..<3 {
            for k in 0..<3 { MtM[i*3+j] += M[k*3+i] * M[k*3+j] }
        }
    }
    // For a 3x3 matrix, use Jacobi SVD or just enforce orthogonality iteratively
    // Simple approach: Gram-Schmidt on columns then fix determinant
    var c0 = [M[0], M[3], M[6]]
    var c1 = [M[1], M[4], M[7]]

    let n0 = sqrt(c0.reduce(0) { $0 + $1 * $1 })
    if n0 > 1e-10 { c0 = c0.map { $0 / n0 } }

    let dot01 = c0[0]*c1[0] + c0[1]*c1[1] + c0[2]*c1[2]
    c1 = zip(c1, c0).map { $0.0 - dot01 * $0.1 }
    let n1 = sqrt(c1.reduce(0) { $0 + $1 * $1 })
    if n1 > 1e-10 { c1 = c1.map { $0 / n1 } }

    let c2 = cross(c0, c1)

    var R = [Double](repeating: 0, count: 9)
    R[0] = c0[0]; R[1] = c1[0]; R[2] = c2[0]
    R[3] = c0[1]; R[4] = c1[1]; R[5] = c2[1]
    R[6] = c0[2]; R[7] = c1[2]; R[8] = c2[2]

    // Ensure det(R) = +1
    let det = R[0]*(R[4]*R[8]-R[5]*R[7]) - R[1]*(R[3]*R[8]-R[5]*R[6]) + R[2]*(R[3]*R[7]-R[4]*R[6])
    if det < 0 { R = R.map { -$0 } }

    return R
}

/// Convert a 3x3 rotation matrix (flat row-major) to a Rodrigues rotation vector.
private func rotationMatrixToRvec(_ R: [Double]) -> [Double] {
    // theta = arccos((tr(R) - 1) / 2)
    let tr = R[0] + R[4] + R[8]
    let cosTheta = max(-1, min(1, (tr - 1) / 2))
    let theta = acos(cosTheta)

    if theta < 1e-10 {
        // Small rotation: rvec ≈ [R[7]-R[5], R[2]-R[6], R[3]-R[1]] / 2
        return [(R[7]-R[5])/2, (R[2]-R[6])/2, (R[3]-R[1])/2]
    }

    // General case: axis = [R[7]-R[5], R[2]-R[6], R[3]-R[1]] / (2*sin(theta))
    let sinTheta = sin(theta)
    if abs(sinTheta) < 1e-10 {
        // theta ≈ π, need special handling
        // Find the column of (R + I) with largest norm
        let Rp = [R[0]+1, R[1], R[2], R[3], R[4]+1, R[5], R[6], R[7], R[8]+1]
        var bestCol = 0
        var bestNorm = 0.0
        for c in 0..<3 {
            let n = Rp[c]*Rp[c] + Rp[3+c]*Rp[3+c] + Rp[6+c]*Rp[6+c]
            if n > bestNorm { bestNorm = n; bestCol = c }
        }
        let norm = sqrt(bestNorm)
        if norm < 1e-10 { return [0, 0, 0] }
        let axis = [Rp[bestCol]/norm, Rp[3+bestCol]/norm, Rp[6+bestCol]/norm]
        return axis.map { $0 * theta }
    }

    let k = theta / (2 * sinTheta)
    return [(R[7]-R[5])*k, (R[2]-R[6])*k, (R[3]-R[1])*k]
}

// MARK: - Private helpers

/// Euclidean distance between two 2D points.
private func euclideanNorm(_ a: [Double], _ b: [Double]) -> Double {
    let dx = a[0] - b[0]
    let dy = a[1] - b[1]
    return sqrt(dx * dx + dy * dy)
}
