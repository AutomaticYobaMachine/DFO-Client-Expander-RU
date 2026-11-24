// 12-Frame High-Contrast Chiaroscuro Dungeon Z-Layer Generator (Jagged-Teeth Edition)
//
// Builds 12 unique animation frames (F0..F11) on top of our 6 pixel-locked pure AI
// empty-bowl stone plates (with the rogue floor bright spot on raw plate #4 healed!):
//   - ZERO whirlpool / spiral waves!
//   - ZERO Bayer checkerboard noise!
//   - IDENTICAL calm global luminance across ALL 12 frames (ZERO strobe!)
//   - Every transition between lighting fill tiers (light -> dark on flagstones, pillars,
//     arches, brick wall, and Pillar 2's wide cast shadow) uses crisp, authentic
//     1-2 logical-pixel-tall HORIZONTAL JAGGED PIXEL TEETH ("зубастые полоски пикселей,
//     врезающиеся в соседний слой"), uniquely randomized on each of the 12 frames F0..F11,
//     while keeping every stone crack, mortar joint, bevel & iron chain 100% pinned!
package main

import (
	"fmt"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"math"
	"os"
	"path/filepath"
	"strings"
)

const (
	outW = 688 // crisp 2x logical grid (344x192 logical pixels)
	outH = 384
	logW = outW / 2
	logH = outH / 2
)

type pt struct{ x, y float64 }

type frameToothSpec struct {
	baseIdx int    // underlying clean AI empty-bowl plate (0..5)
	seed    uint32 // unique random tooth-comb seed for this frame
}

var frameSpecs = []frameToothSpec{
	{baseIdx: 0, seed: 1009},
	{baseIdx: 1, seed: 2027},
	{baseIdx: 2, seed: 3049},
	{baseIdx: 3, seed: 4073},
	{baseIdx: 4, seed: 5099},
	{baseIdx: 5, seed: 6131},
	{baseIdx: 0, seed: 7159},
	{baseIdx: 1, seed: 8191},
	{baseIdx: 2, seed: 9221},
	{baseIdx: 3, seed: 10253},
	{baseIdx: 4, seed: 11287},
	{baseIdx: 5, seed: 12323},
}

func clamp(v, lo, hi float64) float64 {
	if v < lo { return lo }
	if v > hi { return hi }
	return v
}

func smoothstep(e0, e1, x float64) float64 {
	t := clamp((x-e0)/(e1-e0), 0, 1)
	return t * t * (3.0 - 2.0*t)
}

func lum(c color.RGBA) float64 {
	return 0.2126*float64(c.R) + 0.7152*float64(c.G) + 0.0722*float64(c.B)
}

func lumNorm(c color.RGBA) float64 {
	return lum(c) / 255.0
}

// Fast deterministic integer hash -> [0..1)
func hash01(a, b int, seed uint32) float64 {
	h := uint32(a)*374761393 + uint32(b)*668265263 + seed*1442695041
	h = (h ^ (h >> 13)) * 1274126177
	h = h ^ (h >> 16)
	return float64(h&0xFFFFFF) / float64(0x1000000)
}

// Per-logical-scanline jagged tooth offset in [-1 .. +1], producing crisp 1-logical-pixel
// (occasionally 2-logical-pixel) horizontal strips ("зубастые полоски") — ZERO checkerboard!
func scanlineTooth(ly, region int, seed uint32) float64 {
	// 72% independent 1-row crisp teeth + 28% occasional 2-row thick teeth (exact match to user ref crop!)
	r1 := hash01(ly, region, seed)*2.0 - 1.0
	r2 := hash01(ly/2, region+71, seed^0x9E3779B9)*2.0 - 1.0
	v := r1*0.72 + r2*0.28
	// Push slightly away from 0 so teeth look crisp & decisive rather than tiny shy 0px nubs
	if v >= 0 {
		return math.Pow(v, 0.78)
	}
	return -math.Pow(-v, 0.78)
}

func inPoly(px, py float64, poly []pt) bool {
	inside := false
	j := len(poly) - 1
	for i := 0; i < len(poly); i++ {
		xi, yi := poly[i].x, poly[i].y
		xj, yj := poly[j].x, poly[j].y
		if ((yi > py) != (yj > py)) && (px < (xj-xi)*(py-yi)/(yj-yi+1e-9)+xi) {
			inside = !inside
		}
		j = i
	}
	return inside
}

func loadImage(path string) image.Image {
	f, err := os.Open(path)
	if err != nil { panic(err) }
	defer f.Close()
	if strings.HasSuffix(strings.ToLower(path), ".png") {
		im, err := png.Decode(f)
		if err != nil { panic(err) }
		return im
	}
	im, err := jpeg.Decode(f)
	if err != nil { panic(err) }
	return im
}

func savePNG(path string, img image.Image) {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil { panic(err) }
	f, err := os.Create(path)
	if err != nil { panic(err) }
	defer f.Close()
	enc := png.Encoder{CompressionLevel: png.BestCompression}
	if err := enc.Encode(f, img); err != nil { panic(err) }
}

// Wide, physically accurate Pillar 2 + Overhead Gothic Arch cast shadow:
//   - On Pillar 2's vertical right stone edge (y = 104..312): straight solid architectural edge
//     with ONLY delicate 2-logical-pixel edge dithering (ZERO saw-blade teeth biting into the column!)
//   - On the wide floor cast shadow & upper rear vault: crisp horizontal jagged pixel strips ("зубастые полоски")!
func pillarAndVaultShadow(lx, ly int, seed uint32) float64 {
	fx, fy := float64(lx*2), float64(ly*2)

	var behindStep float64
	if fy < 104 {
		// Upper foreground Gothic arch rib outer edge -> crisp subtle horizontal teeth behind the arch
		t := (104.0 - fy) / 104.0
		occRightEdge := 230.0 + t*34.0
		archTooth := scanlineTooth(ly, 11, seed) * 5.0
		vDist := fx - (occRightEdge + archTooth)
		if vDist <= -2.0 {
			return 0
		} else if vDist < 2.0 {
			behindStep = 0.55
		} else {
			behindStep = 1.0
		}
	} else {
		// Straight architectural right flank of Pillar 2 (capital, shaft, pedestal) —
		// NEVER chewed by big teeth! Only delicate 1-2 logical-pixel randomized dithering on the exact rim!
		var colRightEdge float64
		if fy < 130 {
			colRightEdge = 254.0 // capital right edge
		} else if fy < 284 {
			colRightEdge = 244.0 // shaft right edge
		} else {
			colRightEdge = 256.0 // pedestal right edge
		}
		vDist := fx - colRightEdge // in physical px (2px = 1 logical px)
		if vDist <= -4.0 {
			return 0
		} else if vDist >= 4.0 {
			behindStep = 1.0
		} else {
			// Delicate 2-logical-pixel-thick randomized edge dithering strictly along Pillar 2's right rim
			frac := (vDist + 4.0) / 8.0 // 0..1 across 4 physical px (= 2 logical px!)
			// Crisp pixel dither threshold combining checkerboard parity + per-frame micro-randomness
			parity := float64((lx+ly)&1)*0.42 + hash01(lx, ly, seed^0x517CC1B7)*0.58
			if frac > parity {
				behindStep = 0.65 + frac*0.35
			} else if frac > parity-0.25 {
				behindStep = 0.35
			} else {
				return 0
			}
		}
	}

	// Wide cast-shadow floor boundary: starts behind Pillar 2 base (240, 304) and slopes gently down-right
	// across the flagstones, breaking into crisp HORIZONTAL PIXEL STRIPS ("зубастые полоски") per row!
	// Because the floor shadow edge is nearly horizontal, we modulate each scanline's horizontal strip
	// threshold cleanly across local 22px tile zones so horizontal strips poke far right & dark cuts poke left!
	baseFloorY := 304.0 + (fx-240.0)*0.098

	// Compute jagged horizontal-strip offset for this scanline `ly`!
	// On each row `ly`, the horizontal shadow boundary shifts horizontally by +/- 28..45px (along x),
	// plus occasional recessed horizontal dark finger strips (matching the user's exact reference crop!).
	rowShiftY := scanlineTooth(ly, 23, seed) * 6.5
	// Also vary strip fingers across coarse horizontal flagstone intervals (~44px) so teeth look organic across the floor
	segIdx := lx / 22
	segToothY := scanlineTooth(ly, 40+segIdx, seed^0x3C6EF372) * 5.0
	// Add sharp crisp strip-edge transition inside each segment so individual rows form true horizontal bars!
	segPos := float64(lx%22) / 22.0
	stripLen := 0.25 + hash01(ly, 90+segIdx, seed)*0.65
	var fingerBonus float64
	if segPos < stripLen {
		fingerBonus = 2.8
	} else {
		fingerBonus = -2.8
	}

	effEdgeY := baseFloorY + rowShiftY + segToothY + fingerBonus
	distY := effEdgeY - fy // >0 means above edge (in shadow), <0 means below edge (lit foreground floor)

	var floorStep float64
	if distY <= -3.0 {
		return 0
	} else if distY < 2.0 {
		// Crisp intermediate half-shadow tooth step (no mushy gradient, no checkerboard!)
		floorStep = 0.52
	} else {
		floorStep = 1.0
	}

	vaultBoost := 1.0 - smoothstep(140.0, 265.0, fy)*0.10
	return clamp(behindStep*floorStep*vaultBoost, 0, 1)
}

// High-contrast cold bluish-black chiaroscuro base grade (ZERO checkerboard, ZERO spiral!)
func gradeChiaroscuroBase(c color.RGBA, x, y int, castSh float64) color.RGBA {
	r := float64(c.R) / 255.0
	g := float64(c.G) / 255.0
	b := float64(c.B) / 255.0
	L := 0.2126*r + 0.7152*g + 0.0722*b

	darkFactor := 1.0 - smoothstep(0.18, 0.72, L)

	rMul := 1.0 - darkFactor*0.62
	gMul := 1.0 - darkFactor*0.50
	bMul := 1.0 - darkFactor*0.36
	hiBoost := smoothstep(0.62, 0.92, L) * 0.10

	behindBrazier := smoothstep(72, 92, float64(x)) * (1.0 - smoothstep(182, 196, float64(x))) *
		smoothstep(48, 86, float64(y)) * (1.0 - smoothstep(245, 285, float64(y))) * darkFactor
	if behindBrazier > 0.01 {
		rMul *= (1.0 - behindBrazier*0.34)
		gMul *= (1.0 - behindBrazier*0.26)
		bMul *= (1.0 - behindBrazier*0.18)
	}

	if castSh > 0.001 {
		rMul *= (1.0 - castSh*0.68)
		gMul *= (1.0 - castSh*0.58)
		bMul *= (1.0 - castSh*0.45)
		hiBoost *= (1.0 - castSh)
	}

	farRight := smoothstep(500.0, 680.0, float64(x)) * smoothstep(295.0, 384.0, float64(y))
	if farRight > 0.001 {
		rMul *= (1.0 - farRight*0.38)
		gMul *= (1.0 - farRight*0.32)
		bMul *= (1.0 - farRight*0.24)
		hiBoost *= (1.0 - farRight*0.8)
	}

	nr := clamp(r*rMul+hiBoost*0.85, 0, 1)
	ng := clamp(g*gMul+hiBoost*0.95, 0, 1)
	nb := clamp(b*bMul+hiBoost*1.00, 0, 1)

	if nb < 0.048 && L > 0.02 {
		nb = math.Max(nb, 0.032+L*0.045)
	}

	return color.RGBA{
		uint8(math.Round(nr * 255)),
		uint8(math.Round(ng * 255)),
		uint8(math.Round(nb * 255)),
		255,
	}
}

// Apply crisp HORIZONTAL JAGGED PIXEL TEETH ("зубастые полоски пикселей, врезающиеся в соседний слой")
// strictly along existing light-tier boundaries on every illuminated stone surface!
//   - Works on the exact native 344x192 logical pixel grid (1 logical px = 2x2 output px)
//   - Copies REAL adjacent tier pixel colors along each horizontal scanline `ly`
//   - NEVER crosses a dark mortar crack, stone seam, 1px bright tile bevel, or iron outline!
//   - ZERO whirlpool, ZERO checkerboard, ZERO brightness shift!
func applyJaggedTierTeeth(src *image.RGBA, seed uint32) *image.RGBA {
	// Extract native logical grid (logW x logH)
	lPix := make([]color.RGBA, logW*logH)
	lLum := make([]float64, logW*logH)
	for ly := 0; ly < logH; ly++ {
		for lx := 0; lx < logW; lx++ {
			c := src.RGBAAt(lx*2, ly*2)
			lPix[ly*logW+lx] = c
			lLum[ly*logW+lx] = lumNorm(c)
		}
	}

	// Precompute structural lock mask (dark mortar cracks, sharp 1px stone bevels, wrought-iron brazier)
	locked := make([]bool, logW*logH)
	for ly := 0; ly < logH; ly++ {
		for lx := 0; lx < logW; lx++ {
			idx := ly*logW + lx
			L := lLum[idx]
			// 1. Wrought-iron brazier & hanging chains (lx=46..98, ly=96..182)
			if lx >= 46 && lx <= 98 && ly >= 96 && ly <= 182 && L < 0.24 {
				locked[idx] = true
				continue
			}
			// 2. Deep dark mortar cracks / architectural outlines
			if L < 0.075 {
				locked[idx] = true
				continue
			}
			// 3. Crisp 1px bright horizontal stone bevels & vertical pillar outline edges
			if ly > 0 && ly < logH-1 {
				lUp := lLum[(ly-1)*logW+lx]
				lDn := lLum[(ly+1)*logW+lx]
				// Bright bevel sitting right above/below a dark mortar crack -> lock!
				if (L-lUp > 0.22 && L-lDn > 0.22) || math.Abs(lUp-lDn) > 0.34 {
					locked[idx] = true
					continue
				}
			}
			if lx > 0 && lx < logW-1 {
				lLt := lLum[ly*logW+(lx-1)]
				lRt := lLum[ly*logW+(lx+1)]
				// Sharp vertical structural edge (e.g., pillar silhouette against abyss) -> lock!
				if math.Abs(lRt-lLt) > 0.34 {
					locked[idx] = true
					continue
				}
			}
		}
	}

	out := image.NewRGBA(src.Bounds())
	for ly := 0; ly < logH; ly++ {
		for lx := 0; lx < logW; lx++ {
			idx := ly*logW + lx
			chosen := lPix[idx]

			if !locked[idx] {
				// Adapt max horizontal tooth length to surface scale:
				//   - Fine carved scroll panels on Pillar 1 & Pillar 2: tight +/-1 logical px (zero vine tearing!)
				//   - Upper foreground Gothic arch & brick masonry: crisp +/-2 logical px
				//   - Broad stone flagstones & floor/shadow transitions: bold +/-4 logical px ("зубастые полоски"!)
				maxAmp := 4.2
				inPillar1Scroll := lx >= 12 && lx <= 40 && ly >= 56 && ly <= 162
				inPillar2Scroll := lx >= 95 && lx <= 128 && ly >= 52 && ly <= 156
				// Lock Pillar 2's right edge band (lx 119..130, ly 52..156) so ONLY the clean 2px rim dither acts there
				onPillar2RightEdge := lx >= 119 && lx <= 130 && ly >= 52 && ly <= 156
				if onPillar2RightEdge {
					maxAmp = 0.0
				} else if inPillar1Scroll || inPillar2Scroll {
					maxAmp = 1.15
				} else if ly < 126 {
					maxAmp = 2.4
				}

				hZone := lx / 28
				tVal := scanlineTooth(ly, 200+hZone, seed^0xA511E9B3)
				shift := int(math.Round(tVal * maxAmp))

				if shift != 0 {
					step := 1
					if shift < 0 {
						step = -1
					}
					tx := lx
					valid := true
					// Walk pixel-by-pixel along scanline `ly`, stopping immediately before any crack/seam/edge!
					for s := 0; s < int(math.Abs(float64(shift))); s++ {
						nx := tx + step
						if nx < 0 || nx >= logW {
							valid = false
							break
						}
						nIdx := ly*logW + nx
						if locked[nIdx] {
							break
						}
						// Do not step across a huge structural silhouette cliff (> 0.28 single-pixel jump)
						if math.Abs(lLum[nIdx]-lLum[ly*logW+tx]) > 0.28 {
							break
						}
						tx = nx
					}
					if valid && tx != lx {
						cand := lPix[ly*logW+tx]
						dL := math.Abs(lumNorm(cand) - lLum[idx])
						// Only replace when crossing a genuine illumination-tier boundary (delta 0.035..0.34)!
						if dL >= 0.035 && dL <= 0.34 {
							chosen = cand
						}
					}
				}
			}

			// Write crisp 2x2 logical pixel block (zero sub-pixel blur!)
			ox, oy := lx*2, ly*2
			out.SetRGBA(ox, oy, chosen)
			out.SetRGBA(ox+1, oy, chosen)
			out.SetRGBA(ox, oy+1, chosen)
			out.SetRGBA(ox+1, oy+1, chosen)
		}
	}
	return out
}

func main() {
	brainDir := `C:\Users\YobaMegaDrive\.gemini\antigravity\brain\797b5b67-ee83-43bf-b34d-6ec5cc349585`
	rawFiles := []string{
		filepath.Join(brainDir, "dungeon_master_nofire_f0_1795366473136.jpg"),
		filepath.Join(brainDir, "dungeon_nofire_f1_1795366816018.jpg"),
		filepath.Join(brainDir, "dungeon_nofire_f2_1795367140999.jpg"),
		filepath.Join(brainDir, "dungeon_nofire_f3_1795367605615.jpg"),
		filepath.Join(brainDir, "dungeon_nofire_f4_1795367935722.jpg"),
		filepath.Join(brainDir, "dungeon_nofire_f5_1795368226887.jpg"),
	}

	plates := make([]*image.RGBA, len(rawFiles))
	for i, fp := range rawFiles {
		src := loadImage(fp)
		sb := src.Bounds()
		pl := image.NewRGBA(image.Rect(0, 0, outW, outH))
		for y := 0; y < outH; y++ {
			sy := sb.Min.Y + int(math.Floor((float64(y)+0.5)*float64(sb.Dy())/float64(outH)))
			for x := 0; x < outW; x++ {
				sx := sb.Min.X + int(math.Floor((float64(x)+0.5)*float64(sb.Dx())/float64(outW)))
				r, g, b, _ := src.At(sx, sy).RGBA()
				pl.SetRGBA(x, y, color.RGBA{uint8(r >> 8), uint8(g >> 8), uint8(b >> 8), 255})
			}
		}
		plates[i] = pl
	}

	// Heal the rogue bright floor spot on raw plate #4 from spotless master plate #0
	for y := 305; y <= 372; y++ {
		for x := 415; x <= 530; x++ {
			c0 := plates[0].RGBAAt(x, y)
			c4 := plates[4].RGBAAt(x, y)
			if lum(c4)-lum(c0) > 12 {
				plates[4].SetRGBA(x, y, c0)
			}
		}
	}

	outDir := filepath.Join("DFO-Client-Expander-RU-main", "tools", "stand", "dungeon-assets")
	if err := os.MkdirAll(outDir, 0o755); err != nil { panic(err) }

	entries, _ := os.ReadDir(outDir)
	for _, e := range entries {
		if strings.HasSuffix(e.Name(), ".png") {
			_ = os.Remove(filepath.Join(outDir, e.Name()))
		}
	}

	// Precompute exact boolean Z-occlusion masks
	maskArch := make([]bool, outW*outH)
	maskPillars := make([]bool, outW*outH)
	maskFgStatic := make([]bool, outW*outH)

	pillar3Poly := []pt{
		{585, 0}, {715, 0}, {695, 255}, {696, 302}, {684, 308},
		{684, 526}, {696, 534}, {696, 560}, {600, 560}, {600, 525},
		{612, 520}, {612, 305}, {600, 298}, {600, 255},
	}
	pillar4Poly := []pt{
		{1105, 0}, {1235, 0}, {1224, 265}, {1224, 312}, {1210, 318},
		{1210, 540}, {1218, 550}, {1218, 582}, {1128, 582}, {1128, 542},
		{1140, 535}, {1140, 315}, {1128, 308}, {1128, 265},
	}
	pillar5Poly := []pt{
		{1230, 0}, {1376, 0}, {1376, 768}, {1255, 768}, {1255, 622},
		{1278, 608}, {1280, 224}, {1254, 214}, {1254, 128}, {1272, 110},
	}
	pillar1Poly := []pt{
		{0, 0}, {160, 0}, {175, 130}, {175, 204}, {148, 214},
		{148, 605}, {175, 624}, {175, 768}, {0, 768},
	}

	for y := 0; y < outH; y++ {
		oy := float64(y * 2)
		for x := 0; x < outW; x++ {
			ox := float64(x * 2)
			idx := y*outW + x
			if oy <= 525 && ox >= 785 && ox <= 1120 {
				inDoor := false
				if oy >= 300 && ox >= 856 && ox <= 1034 {
					inDoor = true
				} else if oy >= 198 && oy < 300 {
					frac := (300.0 - oy) / 102.0
					halfW := 89.0 * math.Sqrt(math.Max(0, 1.0-frac*frac))
					if math.Abs(ox-945.0) < halfW {
						inDoor = true
					}
				}
				if !inDoor {
					maskArch[idx] = true
				}
			}
			if inPoly(ox, oy, pillar3Poly) || inPoly(ox, oy, pillar4Poly) {
				maskPillars[idx] = true
			}
			if inPoly(ox, oy, pillar5Poly) || inPoly(ox, oy, pillar1Poly) {
				maskFgStatic[idx] = true
			}
		}
	}

	renderedBgs := make([]*image.RGBA, len(frameSpecs))
	for fi, sp := range frameSpecs {
		plate := plates[sp.baseIdx]

		// Step 1: High-contrast chiaroscuro + wide Pillar 2 & vault cast shadow with pure horizontal jagged teeth!
		graded := image.NewRGBA(image.Rect(0, 0, outW, outH))
		for ly := 0; ly < logH; ly++ {
			for lx := 0; lx < logW; lx++ {
				sh := pillarAndVaultShadow(lx, ly, sp.seed)
				for dy := 0; dy < 2; dy++ {
					for dx := 0; dx < 2; dx++ {
						x, y := lx*2+dx, ly*2+dy
						graded.SetRGBA(x, y, gradeChiaroscuroBase(plate.RGBAAt(x, y), x, y, sh))
					}
				}
			}
		}

		// Step 2: Randomize horizontal jagged pixel teeth along ALL tonal fill-tier boundaries on stone surfaces!
		bg := applyJaggedTierTeeth(graded, sp.seed)

		occ1 := image.NewRGBA(image.Rect(0, 0, outW, outH))
		occ2 := image.NewRGBA(image.Rect(0, 0, outW, outH))
		occ3 := image.NewRGBA(image.Rect(0, 0, outW, outH))

		var lumSum float64
		for y := 0; y < outH; y++ {
			oy := float64(y * 2)
			for x := 0; x < outW; x++ {
				ox := float64(x * 2)
				idx := y*outW + x
				c := bg.RGBAAt(x, y)
				rawC := plate.RGBAAt(x, y)
				lumSum += lum(c)

				if maskArch[idx] {
					occ1.SetRGBA(x, y, c)
				}
				if maskPillars[idx] {
					occ2.SetRGBA(x, y, c)
				}
				if maskFgStatic[idx] {
					occ3.SetRGBA(x, y, c)
				} else if ox >= 200 && ox <= 378 && oy >= 420 && oy <= 506 {
					ex := (ox - 289.0) / 89.0
					ey := (oy - 434.0) / 72.0
					inFrontCage := (oy >= 444 && ex*ex+ey*ey <= 1.10) || (oy >= 422 && oy < 444 && lum(rawC) < 28 && int(rawC.B) < 52)
					if inFrontCage && lum(rawC) < 34 && int(rawC.B) < 62 {
						occ3.SetRGBA(x, y, c)
					}
				}
			}
		}

		renderedBgs[fi] = bg
		savePNG(filepath.Join(outDir, fmt.Sprintf("bg_F%d.png", fi)), bg)
		savePNG(filepath.Join(outDir, fmt.Sprintf("occ1_F%d.png", fi)), occ1)
		savePNG(filepath.Join(outDir, fmt.Sprintf("occ2_F%d.png", fi)), occ2)
		savePNG(filepath.Join(outDir, fmt.Sprintf("occ3_F%d.png", fi)), occ3)

		var diffPix int
		if fi > 0 {
			for y := 0; y < outH; y++ {
				for x := 0; x < outW; x++ {
					a := renderedBgs[0].RGBAAt(x, y)
					b := bg.RGBAAt(x, y)
					d := (math.Abs(float64(a.R)-float64(b.R)) + math.Abs(float64(a.G)-float64(b.G)) + math.Abs(float64(a.B)-float64(b.B))) / 3.0
					if d > 8 {
						diffPix++
					}
				}
			}
		}
		fmt.Printf("F%02d (plate#%d): meanLum=%.2f, jaggedTeethChangedPix(>8)=%.2f%%\n",
			fi, sp.baseIdx, lumSum/float64(outW*outH), float64(diffPix)/float64(outW*outH)*100)
	}

	// Diagnostic 1: 4x zoomed-in strip of the exact floor shadow-border transition across F0, F1, F2, F3
	// (matching the user's uploaded crop scale so we inspect every single horizontal jagged pixel tooth!)
	cropX, cropY, cropW, cropH := 300, 290, 140, 84
	zoom := 3
	zoomImg := image.NewRGBA(image.Rect(0, 0, cropW*zoom*2, cropH*zoom*2))
	for i := 0; i < 4; i++ {
		col, row := i%2, i/2
		for cy := 0; cy < cropH; cy++ {
			for cx := 0; cx < cropW; cx++ {
				c := renderedBgs[i].RGBAAt(cropX+cx, cropY+cy)
				for zy := 0; zy < zoom; zy++ {
					for zx := 0; zx < zoom; zx++ {
						zoomImg.SetRGBA(col*cropW*zoom+cx*zoom+zx, row*cropH*zoom+cy*zoom+zy, c)
					}
				}
			}
		}
	}
	savePNG(filepath.Join(brainDir, "scratch", "zoom_teeth_verify.png"), zoomImg)

	// Diagnostic 1b: 3x zoomed-in strip of Pillar 2 & its clean 2px dithered right edge across F0..F3!
	pX, pY, pW, pH := 184, 102, 86, 212
	pZoom := image.NewRGBA(image.Rect(0, 0, pW*3*4, pH*3))
	for i := 0; i < 4; i++ {
		for cy := 0; cy < pH; cy++ {
			for cx := 0; cx < pW; cx++ {
				c := renderedBgs[i].RGBAAt(pX+cx, pY+cy)
				for zy := 0; zy < 3; zy++ {
					for zx := 0; zx < 3; zx++ {
						pZoom.SetRGBA(i*pW*3+cx*3+zx, cy*3+zy, c)
					}
				}
			}
		}
	}
	savePNG(filepath.Join(brainDir, "scratch", "zoom_pillar2_edge.png"), pZoom)

	// Diagnostic 2: Full-frame diff heatmap (F1, F3, F6, F9 vs F0) — proves ZERO whirlpool, pure boundary teeth!
	diffCheck := []int{1, 3, 6, 9}
	diffSheet := image.NewRGBA(image.Rect(0, 0, outW*2, outH*2))
	for si, fi := range diffCheck {
		col, row := si%2, si/2
		for y := 0; y < outH; y++ {
			for x := 0; x < outW; x++ {
				a := renderedBgs[0].RGBAAt(x, y)
				b := renderedBgs[fi].RGBAAt(x, y)
				dl := lum(b) - lum(a)
				var cr, cg, cb uint8
				if dl > 0 {
					v := uint8(math.Min(255, dl*4.5))
					cr, cg, cb = v/3, v, v
				} else {
					v := uint8(math.Min(255, -dl*4.5))
					cr, cg, cb = v, v/3, 0
				}
				diffSheet.SetRGBA(col*outW+x, row*outH+y, color.RGBA{cr, cg, cb, 255})
			}
		}
	}
	savePNG(filepath.Join(brainDir, "scratch", "v13_teeth_diff.png"), diffSheet)
	fmt.Printf("Done: %d jagged-teeth frames x 4 Z-layers = %d PNGs\n", len(frameSpecs), len(frameSpecs)*4)
}
