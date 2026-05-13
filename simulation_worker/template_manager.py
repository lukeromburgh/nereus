import os
from jinja2 import Template
import logging

logger = logging.getLogger(__name__)

U_TEMPLATE = """/*--------------------------------*- C++ -*----------------------------------*/
FoamFile { version 2.0; format ascii; class volVectorField; object U; }
// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

dimensions      [0 1 -1 0 0 0 0];
internalField   uniform ({{ ux }} 0 {{ uz }});

boundaryField {
    inlet {
        type            fixedValue;
        value           uniform ({{ ux }} 0 {{ uz }});
    }
    outlet {
        type            zeroGradient;
    }
    foil {
        type            noSlip; // Water "sticks" to the foil surface
    }
    walls {
        type            slip; // Far-field boundaries should not add artificial wall drag
    }
}"""

P_TEMPLATE = """/*--------------------------------*- C++ -*----------------------------------*/
FoamFile { version 2.0; format ascii; class volScalarField; object p; }
// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

dimensions      [0 2 -2 0 0 0 0];
internalField   uniform 0;

boundaryField {
    inlet {
        type            zeroGradient;
    }
    outlet {
        type            fixedValue;
        value           uniform 0;
    }
    foil {
        type            zeroGradient;
    }
    walls {
        type            zeroGradient;
    }
}"""

BLOCK_MESH_TEMPLATE = """/*--------------------------------*- C++ -*----------------------------------*/
FoamFile { version 2.0; format ascii; class dictionary; location "system"; object blockMeshDict; }
// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

convertToMeters 1;

vertices
(
    ({{ x_min }} {{ y_min }} {{ z_min }})
    ({{ x_max }} {{ y_min }} {{ z_min }})
    ({{ x_max }} {{ y_max }} {{ z_min }})
    ({{ x_min }} {{ y_max }} {{ z_min }})
    ({{ x_min }} {{ y_min }} {{ z_max }})
    ({{ x_max }} {{ y_min }} {{ z_max }})
    ({{ x_max }} {{ y_max }} {{ z_max }})
    ({{ x_min }} {{ y_max }} {{ z_max }})
);

blocks
(
    hex (0 1 2 3 4 5 6 7) ({{ nx }} {{ ny }} {{ nz }}) simpleGrading (1 1 1)
);

edges
(
);

boundary
(
    inlet
    {
        type patch;
        faces
        (
            (0 4 7 3)
        );
    }
    outlet
    {
        type patch;
        faces
        (
            (1 2 6 5)
        );
    }
    walls
    {
        type wall;
        faces
        (
            (0 1 5 4)
            (3 7 6 2)
            (0 3 2 1)
            (4 5 6 7)
        );
    }
);

mergePatchPairs
(
);
"""

CONTROL_DICT_TEMPLATE = """/*--------------------------------*- C++ -*----------------------------------*/
FoamFile { version 2.0; format ascii; class dictionary; location "system"; object controlDict; }
// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

application     simpleFoam;
startFrom       startTime;
startTime       0;
stopAt          endTime;
endTime         {{ max_iterations }}; // Usually 500 for steady-state MVP
deltaT          1;
writeControl    runTime;
writeInterval   {{ write_interval }}; // Save every X steps for the UI to update
purgeWrite      20; // Keep enough frames for the 10-frame playback HUD
writeFormat     binary;
writePrecision  6;

functions
{
    // Force telemetry for the Temporal Analysis HUD (Lift/Drag)
    forces
    {
        type            forces;
        libs            ("libforces.so");
        patches         (foil);

        // Incompressible: provide constant rho
        rho             rhoInf;
        rhoInf          {{ water_density }};

        // Center of rotation from user-defined center of gravity
        CofR            ({{ cofr_x }} {{ cofr_y }} {{ cofr_z }});

        writeControl    runTime;
        writeInterval   1;
        log             yes;
    }

    yPlus
    {
        type            yPlus;
        libs            ("libfieldFunctionObjects.so");
        patches         (foil);
        writeControl    writeTime;
        log             yes;
    }

    wallShearStress
    {
        type            wallShearStress;
        libs            ("libfieldFunctionObjects.so");
        patches         (foil);
        writeControl    writeTime;
        log             yes;
    }
}
"""

FV_SCHEMES_TEMPLATE = """/*--------------------------------*- C++ -*----------------------------------*/
FoamFile { version 2.0; format ascii; class dictionary; location "system"; object fvSchemes; }
// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

ddtSchemes
{
    default         steadyState;
}

gradSchemes
{
    default         Gauss linear;
    grad(U)         cellLimited Gauss linear 1;
    grad(k)         cellLimited Gauss linear 1;
    grad(omega)     cellLimited Gauss linear 1;
}

divSchemes
{
    default         none;
    // limitedLinearV is more robust than linearUpwind near poor-quality cells
    // (inverted tets / high non-orth) while still being second-order accurate.
    div(phi,U)      bounded Gauss limitedLinearV 1;
    div(phi,k)      bounded Gauss limitedLinear 1;
    div(phi,omega)  bounded Gauss limitedLinear 1;
    div((nuEff*dev2(T(grad(U))))) Gauss linear;
}

laplacianSchemes
{
    // limited corrected 0.5 blends between uncorrected (stable) and corrected
    // (accurate) — appropriate for meshes with max non-orth ~70-85 degrees.
    default         Gauss linear limited corrected 0.5;
}

interpolationSchemes
{
    default         linear;
}

snGradSchemes
{
    default         limited corrected 0.5;
}

wallDist
{
    method          meshWave;
}
"""

FV_SOLUTION_TEMPLATE = """/*--------------------------------*- C++ -*----------------------------------*/
FoamFile { version 2.0; format ascii; class dictionary; location "system"; object fvSolution; }
// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

solvers
{
    // p_rgh is the solved pressure field when gravity is enabled.
    // Both p_rgh and p_rghFinal must be defined; without them simpleFoam
    // falls back to the 'p' entry which causes pressure-velocity oscillation.
    p_rgh
    {
        solver          GAMG;
        tolerance       1e-7;
        relTol          0.01;
        smoother        GaussSeidel;
        nPreSweeps      0;
        nPostSweeps     2;
        cacheAgglomeration true;
        agglomerator    faceAreaPair;
        nCellsInCoarsestLevel 10;
        mergeLevels     1;
    }

    p_rghFinal
    {
        $p_rgh;
        relTol          0;
    }

    p
    {
        solver          GAMG;
        tolerance       1e-7;
        relTol          0.01;
        smoother        GaussSeidel;
        nPreSweeps      0;
        nPostSweeps     2;
        cacheAgglomeration true;
        agglomerator    faceAreaPair;
        nCellsInCoarsestLevel 10;
        mergeLevels     1;
    }

    U
    {
        solver          smoothSolver;
        smoother        symGaussSeidel;
        tolerance       1e-8;
        relTol          0.1;
    }

    k
    {
        solver          smoothSolver;
        smoother        symGaussSeidel;
        tolerance       1e-8;
        relTol          0.1;
    }

    omega
    {
        solver          smoothSolver;
        smoother        symGaussSeidel;
        tolerance       1e-8;
        relTol          0.1;
    }
}

SIMPLE
{
    // consistent yes reduces pressure-velocity coupling oscillation on
    // non-orthogonal meshes by using a consistent velocity interpolation.
    consistent      yes;
    // 3 correctors needed for max non-orthogonality ~70-85 degrees.
    // 1 corrector was leaving pressure errors that caused the oscillation.
    nNonOrthogonalCorrectors 3;

    residualControl
    {
        p_rgh           1e-4;
        p               1e-4;
        U               1e-5;
        k               1e-4;
        omega           1e-4;
    }
}

relaxationFactors
{
    fields
    {
        p_rgh           0.2;
        p               0.2;
    }
    equations
    {
        U               0.5;
        k               0.5;
        omega           0.5;
    }
}
"""

TRANSPORT_PROPERTIES_TEMPLATE = """/*--------------------------------*- C++ -*----------------------------------*/
FoamFile { version 2.0; format ascii; class dictionary; location "constant"; object transportProperties; }
// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

transportModel  Newtonian;

nu              [0 2 -1 0 0 0 0] {{ nu }};
"""

TURBULENCE_PROPERTIES_TEMPLATE = """/*--------------------------------*- C++ -*----------------------------------*/
FoamFile { version 2.0; format ascii; class dictionary; location "constant"; object turbulenceProperties; }
// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

simulationType  RAS;

RAS
{
    RASModel        kOmegaSST;
    turbulence      on;
    printCoeffs     on;
}
"""

K_TEMPLATE = """/*--------------------------------*- C++ -*----------------------------------*/
FoamFile { version 2.0; format ascii; class volScalarField; object k; }
// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

dimensions      [0 2 -2 0 0 0 0];
internalField   uniform {{ k }};

boundaryField {
    inlet {
        type            fixedValue;
        value           uniform {{ k }};
    }
    outlet {
        type            zeroGradient;
    }
    foil {
        type            kqRWallFunction;
        value           uniform {{ k }};
    }
    walls {
        type            zeroGradient;
    }
}"""

OMEGA_TEMPLATE = """/*--------------------------------*- C++ -*----------------------------------*/
FoamFile { version 2.0; format ascii; class volScalarField; object omega; }
// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

dimensions      [0 0 -1 0 0 0 0];
internalField   uniform {{ omega }};

boundaryField {
    inlet {
        type            fixedValue;
        value           uniform {{ omega }};
    }
    outlet {
        type            zeroGradient;
    }
    foil {
        type            omegaWallFunction;
        value           uniform {{ omega }};
    }
    walls {
        type            zeroGradient;
    }
}"""

NUT_TEMPLATE = """/*--------------------------------*- C++ -*----------------------------------*/
FoamFile { version 2.0; format ascii; class volScalarField; object nut; }
// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

dimensions      [0 2 -1 0 0 0 0];
internalField   uniform {{ nut }};

boundaryField {
    inlet {
        type            calculated;
        value           uniform {{ nut }};
    }
    outlet {
        type            calculated;
        value           uniform 0;
    }
    foil {
        type            nutkWallFunction;
        value           uniform 0;
    }
    walls {
        type            calculated;
        value           uniform 0;
    }
}"""

SHM_TEMPLATE = """/*--------------------------------*- C++ -*----------------------------------*/
FoamFile { version 2.0; format ascii; class dictionary; object snappyHexMeshDict; }
// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

castellatedMesh true;
snap            true;
addLayers       {{ enable_layers | lower }};

geometry {
    foil.stl {
        type triSurfaceMesh;
        name foil;
    }
{% for region in refinement_regions %}

    {{ region.name }} {
        type searchableBox;
        min ({{ region.min_x }} {{ region.min_y }} {{ region.min_z }});
        max ({{ region.max_x }} {{ region.max_y }} {{ region.max_z }});
    }
{% endfor %}
}

castellatedMeshControls {
    maxLocalCells 2000000;
    maxGlobalCells 5000000;
    minRefinementCells 0;
    nCellsBetweenLevels 3;
    resolveFeatureAngle 30;
    allowFreeStandingZoneFaces true;

    features
    (
        {% if eMesh_available %}{ file "foil.eMesh"; level {{ feature_level }}; }{% endif %}
    );

    refinementSurfaces {
        foil {
            level ({{ surface_min_level }} {{ surface_max_level }});
        }
    }

{% if refinement_regions %}
    refinementRegions {
{% for region in refinement_regions %}
        {{ region.name }} {
            mode inside;
            levels ((1E15 {{ region.level }}));
        }
{% endfor %}
    }
{% endif %}
    
    // CRITICAL: Tells OpenFOAM where the "Water" is.
    // Must be a point OUTSIDE the foil but INSIDE the bounding box.
    locationInMesh ({{ loc_x }} {{ loc_y }} {{ loc_z }}); 
}

snapControls {
    nSmoothPatch 5;
    tolerance 2.0;
    nSolveIter 100;
    nRelaxIter 8;
    explicitFeatureSnap true;
    implicitFeatureSnap false;
    nFeatureSnapIter 15;
}

{% if enable_layers %}
addLayersControls
{
    relativeSizes       false;
    expansionRatio      {{ layer_expansion }};
    firstLayerThickness {{ first_layer_thickness }};
    // minThickness prevents OpenFOAM from squeezing layers into geometry
    // where they would invert.  10% of firstLayerThickness is the target
    // but never less than 1e-8 (avoids divisions on very thin y+ targets).
    minThickness        {{ [first_layer_thickness * 0.1, 1e-8] | max }};
    nGrow               0;
    // 120 deg: layers stop at the trailing-edge feature (~30 deg included
    // angle) before cells invert.  60 deg was too permissive and caused
    // 14 inverted faces in run 107.
    featureAngle        120;
    nRelaxIter          10;
    nSmoothSurfaceNormals 3;
    nSmoothNormals      3;
    nSmoothThickness    10;
    maxFaceThicknessRatio 0.5;
    maxThicknessToMedialRatio 0.3;
    minMedianAxisAngle  90;
    // 1-cell buffer at feature stops abrupt layer-height jumps that cause skew.
    nBufferCellsNoExtrude 1;
    nLayerIter          50;

    layers
    {
        foil
        {
            nSurfaceLayers  {{ n_surface_layers }};
        }
    }
}
{% endif %}

meshQualityControls
{
    maxNonOrtho         65;
    maxBoundarySkewness 20;
    maxInternalSkewness 4;
    maxConcave          80;
    minVol              1e-13;
    minTetQuality       1e-9;
    minArea             -1;
    minTwist            0.02;
    minDeterminant      0.001;
    minFaceWeight       0.02;
    minVolRatio         0.01;
    minTriangleTwist    -1;
    nSmoothScale        4;
    errorReduction      0.75;

    relaxed
    {
        maxNonOrtho     75;
    }
}

mergeTolerance 1e-6;
"""

G_TEMPLATE = """/*--------------------------------*- C++ -*----------------------------------*/
FoamFile { version 2.0; format ascii; class uniformDimensionedVectorField;
           object g; }
// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

dimensions      [0 1 -2 0 0 0 0];
value           (0 0 -9.81);
"""

P_RGH_TEMPLATE = """/*--------------------------------*- C++ -*----------------------------------*/
FoamFile { version 2.0; format ascii; class volScalarField; object p_rgh; }
// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

dimensions      [0 2 -2 0 0 0 0];
internalField   uniform 0;

boundaryField {
    inlet {
        type            fixedFluxPressure;
        gradient        uniform 0;
        value           uniform 0;
    }
    outlet {
        type            fixedValue;
        value           uniform 0;
    }
    foil {
        type            fixedFluxPressure;
        gradient        uniform 0;
        value           uniform 0;
    }
    walls {
        type            fixedFluxPressure;
        gradient        uniform 0;
        value           uniform 0;
    }
}
"""

SURFACE_FEATURE_EXTRACT_TEMPLATE = """/*--------------------------------*- C++ -*----------------------------------*/
FoamFile { version 2.0; format ascii; class dictionary;
           object surfaceFeaturesDict; }
// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //
// OF11: surfaceFeatureExtract replaced by surfaceFeatures + surfaceFeaturesDict

foil.stl
{
    extractionMethod    extractFromSurface;

    extractFromSurfaceCoeffs
    {
        includedAngle   150;
    }

    writeObj            yes;
}
"""

class TemplateManager:
    """
    Manages the generation of OpenFOAM dictionary files (controlDict, U, p, etc.)
    using Jinja2 templates based on variables from the user UI payload.
    """
    def __init__(self, case_dir):
        self.case_dir = case_dir
        # Ensure base directories exist
        os.makedirs(os.path.join(self.case_dir, "0"), exist_ok=True)
        os.makedirs(os.path.join(self.case_dir, "system"), exist_ok=True)
        os.makedirs(os.path.join(self.case_dir, "constant"), exist_ok=True)
        os.makedirs(os.path.join(self.case_dir, "constant", "triSurface"), exist_ok=True)

    def write_file(self, relative_path, template_str, context):
        """Renders a template string with context and writes it to the case directory."""
        template = Template(template_str)
        rendered = template.render(**context)
        file_path = os.path.join(self.case_dir, relative_path)
        with open(file_path, "w") as f:
            f.write(rendered)
        logger.info(f"Generated {relative_path}")

    def initialize_case(
        self,
        velocity,
        water_density,
        location_in_mesh=(0.5, 0.5, 0.5),
        max_iterations=1000,
        write_interval=50,
        domain=None,
        mesh_cells=None,
        nu=1e-6,
        angle_of_attack=0.0,
        center_of_gravity=(0, 0, 0),
        enable_layers=True,
        n_surface_layers=5,
        layer_expansion=1.2,
        first_layer_thickness=1e-4,
        feature_level=4,
        enable_gravity=True,
        chord_m=None,
        refinement_regions=None,
    ):
        """
        Generates the initialized OpenFOAM dict structures based on user inputs.
        """
        import math

        aoa_rad = math.radians(float(angle_of_attack))
        u_mag = max(abs(float(velocity)), 0.01)
        ux = u_mag * math.cos(aoa_rad)
        uz = -u_mag * math.sin(aoa_rad)  # negative: positive AoA tilts flow downward

        logger.info(
            f"Writing Configuration Dicts for Case: Velocity={velocity}, AoA={angle_of_attack}°, "
            f"Ux={ux:.4f}, Uz={uz:.4f}, Density={water_density}"
        )
        
        # 1. Write the Velocity (U) dict with AoA-decomposed components
        self.write_file("0/U", U_TEMPLATE, {"ux": f"{ux:.6g}", "uz": f"{uz:.6g}"})
        
        # 2. Write the Pressure dict — p_rgh when gravity is on, plain p otherwise
        if enable_gravity:
            self.write_file("0/p_rgh", P_RGH_TEMPLATE, {})
            self.write_file("0/p", P_TEMPLATE, {})
            self.write_file("constant/g", G_TEMPLATE, {})
        else:
            self.write_file("0/p", P_TEMPLATE, {})

        # 3. Turbulence BCs (k-omega SST)
        # Compute inlet turbulence quantities from freestream velocity.
        # TI = 5% turbulence intensity (typical for external water flows)
        # L_turb = 0.07 * L_ref; use actual chord length when available
        ti = 0.05
        l_ref = chord_m if chord_m and chord_m > 0 else 0.1
        k_val = 1.5 * (ti * u_mag) ** 2
        omega_val = math.sqrt(k_val) / (0.09 ** 0.25 * 0.07 * l_ref)
        nut_val = k_val / max(omega_val, 1e-10)

        self.write_file("0/k", K_TEMPLATE, {"k": f"{k_val:.6g}"})
        self.write_file("0/omega", OMEGA_TEMPLATE, {"omega": f"{omega_val:.6g}"})
        self.write_file("0/nut", NUT_TEMPLATE, {"nut": f"{nut_val:.6g}"})
        
        # 4. Write the controlDict (The simulation brain)
        cofr = center_of_gravity if center_of_gravity else (0, 0, 0)
        self.write_file(
            "system/controlDict",
            CONTROL_DICT_TEMPLATE,
            {
                "max_iterations": max_iterations,
                "write_interval": write_interval,
                "water_density": water_density,
                "cofr_x": cofr[0],
                "cofr_y": cofr[1],
                "cofr_z": cofr[2],
            },
        )

        # 3.1 Minimal solver numerics/config required by OpenFOAM
        self.write_file("system/fvSchemes", FV_SCHEMES_TEMPLATE, {})
        self.write_file("system/fvSolution", FV_SOLUTION_TEMPLATE, {})
        self.write_file("constant/transportProperties", TRANSPORT_PROPERTIES_TEMPLATE, {"nu": nu})
        self.write_file("constant/turbulenceProperties", TURBULENCE_PROPERTIES_TEMPLATE, {})
        
        # 4. Write the surfaceFeaturesDict (edge refinement) — OF11 uses surfaceFeatures utility
        self.write_file("system/surfaceFeaturesDict", SURFACE_FEATURE_EXTRACT_TEMPLATE, {})

        # 5. Write the snappyHexMeshDict (mesh shrink-wrap + layers + feature edges)
        # eMesh_available starts False; call refresh_snappy_features() after
        # surfaceFeatureExtract to re-render with edges enabled.
        surface_max_level = max(5, int(feature_level))
        surface_min_level = max(4, surface_max_level - 1)
        self._snappy_context = {
            "loc_x": location_in_mesh[0],
            "loc_y": location_in_mesh[1],
            "loc_z": location_in_mesh[2],
            "enable_layers": enable_layers,
            "n_surface_layers": n_surface_layers,
            "layer_expansion": layer_expansion,
            "first_layer_thickness": first_layer_thickness,
            "feature_level": feature_level,
            "surface_min_level": surface_min_level,
            "surface_max_level": surface_max_level,
            "eMesh_available": False,
            "refinement_regions": refinement_regions or [],
        }
        self.write_file("system/snappyHexMeshDict", SHM_TEMPLATE, self._snappy_context)

        # 5. Write the blockMeshDict (Base mesh required by snappyHexMesh)
        domain = domain or {
            "x_min": -5.0,
            "x_max": 15.0,
            "y_min": -2.0,
            "y_max": 2.0,
            "z_min": -2.0,
            "z_max": 2.0,
        }
        mesh_cells = mesh_cells or {"nx": 40, "ny": 20, "nz": 20}

        self.write_file(
            "system/blockMeshDict",
            BLOCK_MESH_TEMPLATE,
            {
                **domain,
                **mesh_cells,
            },
        )

    def refresh_snappy_features(self):
        """Re-render snappyHexMeshDict with feature edges enabled.

        Call this after surfaceFeatures has run.  If the expected
        ``constant/triSurface/foil.eMesh`` output exists the dict is
        re-written with ``eMesh_available=True``; snappyHexMesh then uses
        the extracted sharp edges to guide the snap phase, eliminating the
        inverted-pyramid faces that appear near the trailing edge when no
        feature guidance is provided.

        OpenFOAM 11 uses ``surfaceFeatures`` (replaces old surfaceFeatureExtract)
        and writes the edge mesh to ``constant/triSurface/<name>.eMesh``.
        If the file is absent the dict is left unchanged and a warning is logged.
        """
        import glob
        emesh_candidates = glob.glob(
            os.path.join(self.case_dir, "constant", "triSurface", "*.eMesh")
        )
        if not emesh_candidates:
            logger.warning(
                "refresh_snappy_features: no .eMesh file found in "
                "constant/triSurface — feature edges will not be used"
            )
            return

        if not hasattr(self, "_snappy_context"):
            logger.warning(
                "refresh_snappy_features: _snappy_context not set — "
                "call initialize_case() first"
            )
            return

        updated_context = dict(self._snappy_context, eMesh_available=True)
        self.write_file("system/snappyHexMeshDict", SHM_TEMPLATE, updated_context)
        self._snappy_context = updated_context
        logger.info(
            "refresh_snappy_features: re-rendered snappyHexMeshDict with "
            "eMesh_available=True (%s)", emesh_candidates[0]
        )
