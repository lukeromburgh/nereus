import os
from jinja2 import Template
import logging

logger = logging.getLogger(__name__)

U_TEMPLATE = """/*--------------------------------*- C++ -*----------------------------------*/
FoamFile { version 2.0; format ascii; class volVectorField; object U; }
// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

dimensions      [0 1 -1 0 0 0 0];
internalField   uniform ({{ velocity }} 0 0);

boundaryField {
    inlet {
        type            fixedValue;
        value           uniform ({{ velocity }} 0 0);
    }
    outlet {
        type            zeroGradient;
    }
    foil {
        type            noSlip; // Water "sticks" to the foil surface
    }
    walls {
        type            noSlip;
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
writeFormat     ascii;
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

        // Center of rotation; keep origin for MVP
        CofR            (0 0 0);

        writeControl    runTime;
        writeInterval   1;
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
    grad(U)         Gauss linear;
}

divSchemes
{
    default         none;
    div(phi,U)      Gauss upwind;
}

laplacianSchemes
{
    default         Gauss linear corrected;
}

interpolationSchemes
{
    default         linear;
}

snGradSchemes
{
    default         corrected;
}
"""

FV_SOLUTION_TEMPLATE = """/*--------------------------------*- C++ -*----------------------------------*/
FoamFile { version 2.0; format ascii; class dictionary; location "system"; object fvSolution; }
// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

solvers
{
    p
    {
        solver          GAMG;
        tolerance       1e-7;
        relTol          0.1;
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
}

SIMPLE
{
    nNonOrthogonalCorrectors 0;

    residualControl
    {
        p               1e-3;
        U               1e-4;
    }
}

relaxationFactors
{
    fields
    {
        p               0.3;
    }
    equations
    {
        U               0.7;
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

simulationType  laminar;
"""

SHM_TEMPLATE = """/*--------------------------------*- C++ -*----------------------------------*/
FoamFile { version 2.0; format ascii; class dictionary; object snappyHexMeshDict; }
// * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * //

castellatedMesh true;
snap            true;
addLayers       false; // Keep false for MVP to ensure stability

geometry {
    foil.stl {
        type triSurfaceMesh;
        name foil;
    }
}

castellatedMeshControls {
    maxLocalCells 1000000;
    maxGlobalCells 2000000;
    minRefinementCells 0;
    nCellsBetweenLevels 1;
    resolveFeatureAngle 30;
    allowFreeStandingZoneFaces true;
    
    refinementSurfaces {
        foil {
            level (3 4); // Min/Max refinement level
        }
    }
    
    // CRITICAL: Tells OpenFOAM where the "Water" is.
    // Must be a point OUTSIDE the foil but INSIDE the bounding box.
    locationInMesh ({{ loc_x }} {{ loc_y }} {{ loc_z }}); 
}

snapControls {
    nSmoothPatch 3;
    tolerance 2.0;
    nSolveIter 30;
    nRelaxIter 5;
}

meshQualityControls
{
    // Minimal defaults for OpenFOAM v11 so snappyHexMesh can run.
    // These can be tightened later once the MVP pipeline is stable.
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
        max_iterations=500,
        write_interval=50,
        domain=None,
        mesh_cells=None,
        nu=1e-6,
    ):
        """
        Generates the initialized OpenFOAM dict structures based on user inputs.
        """
        logger.info(f"Writing Configuration Dicts for Case: Velocity={velocity}, Density={water_density}")
        
        # 1. Write the Velocity (U) dict
        self.write_file("0/U", U_TEMPLATE, {"velocity": velocity})
        
        # 2. Write the Pressure (p) dict (Required to prevent solver crash)
        self.write_file("0/p", P_TEMPLATE, {})
        
        # 3. Write the controlDict (The simulation brain)
        self.write_file(
            "system/controlDict",
            CONTROL_DICT_TEMPLATE,
            {
                "max_iterations": max_iterations,
                "write_interval": write_interval,
                "water_density": water_density,
            },
        )

        # 3.1 Minimal solver numerics/config required by OpenFOAM
        self.write_file("system/fvSchemes", FV_SCHEMES_TEMPLATE, {})
        self.write_file("system/fvSolution", FV_SOLUTION_TEMPLATE, {})
        self.write_file("constant/transportProperties", TRANSPORT_PROPERTIES_TEMPLATE, {"nu": nu})
        self.write_file("constant/turbulenceProperties", TURBULENCE_PROPERTIES_TEMPLATE, {})
        
        # 4. Write the snappyHexMeshDict (The mesh shrink-wrap rules)
        self.write_file("system/snappyHexMeshDict", SHM_TEMPLATE, {
            "loc_x": location_in_mesh[0],
            "loc_y": location_in_mesh[1],
            "loc_z": location_in_mesh[2]
        })

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
