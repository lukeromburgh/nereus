/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Ambient type declarations for @kitware/vtk.js modules that lack
 * complete TypeScript definitions.  skipLibCheck covers most of the
 * library, but verbatimModuleSyntax requires explicit module
 * declarations for default-imported modules.
 */

declare module "@kitware/vtk.js/Rendering/Core/Renderer" {
  const vtkRenderer: {
    newInstance(opts?: { background?: number[] }): any;
  };
  export default vtkRenderer;
}

declare module "@kitware/vtk.js/Rendering/Core/RenderWindow" {
  const vtkRenderWindow: { newInstance(): any };
  export default vtkRenderWindow;
}

declare module "@kitware/vtk.js/Rendering/OpenGL/RenderWindow" {
  const vtkOpenGLRenderWindow: { newInstance(): any };
  export default vtkOpenGLRenderWindow;
}

declare module "@kitware/vtk.js/Rendering/Core/RenderWindowInteractor" {
  const vtkRenderWindowInteractor: { newInstance(): any };
  export default vtkRenderWindowInteractor;
}

declare module "@kitware/vtk.js/Interaction/Style/InteractorStyleTrackballCamera" {
  const vtkInteractorStyleTrackballCamera: { newInstance(): any };
  export default vtkInteractorStyleTrackballCamera;
}

declare module "@kitware/vtk.js/Rendering/Core/Mapper" {
  const vtkMapper: { newInstance(opts?: Record<string, any>): any };
  export default vtkMapper;
}

declare module "@kitware/vtk.js/Rendering/Core/Actor" {
  const vtkActor: { newInstance(): any };
  export default vtkActor;
}

declare module "@kitware/vtk.js/Rendering/Core/ColorTransferFunction" {
  const vtkColorTransferFunction: { newInstance(): any };
  export default vtkColorTransferFunction;
}

declare module "@kitware/vtk.js/Rendering/Core/ColorTransferFunction/ColorMaps" {
  const vtkColorMaps: {
    getPresetByName(name: string): any;
    rgbPresetNames: string[];
  };
  export default vtkColorMaps;
}

declare module "@kitware/vtk.js/Rendering/Core/ScalarBarActor" {
  const vtkScalarBarActor: { newInstance(): any };
  export default vtkScalarBarActor;
}

declare module "@kitware/vtk.js/Rendering/Core/AxesActor" {
  const vtkAxesActor: { newInstance(): any };
  export default vtkAxesActor;
}

declare module "@kitware/vtk.js/Rendering/Core/Light" {
  const vtkLight: { newInstance(opts?: Record<string, any>): any };
  export default vtkLight;
}

declare module "@kitware/vtk.js/Interaction/Widgets/OrientationMarkerWidget" {
  const vtkOrientationMarkerWidget: {
    newInstance(opts?: Record<string, any>): any;
    Corners: {
      TOP_LEFT: number;
      TOP_RIGHT: number;
      BOTTOM_LEFT: number;
      BOTTOM_RIGHT: number;
    };
  };
  export default vtkOrientationMarkerWidget;
}

declare module "@kitware/vtk.js/IO/XML/XMLPolyDataReader" {
  const vtkXMLPolyDataReader: { newInstance(): any };
  export default vtkXMLPolyDataReader;
}

declare module "@kitware/vtk.js/IO/XML/XMLUnstructuredGridReader" {
  const vtkXMLUnstructuredGridReader: { newInstance(): any };
  export default vtkXMLUnstructuredGridReader;
}

declare module "@kitware/vtk.js/Filters/General/ContourFilter" {
  const vtkContourFilter: { newInstance(): any };
  export default vtkContourFilter;
}

declare module "@kitware/vtk.js/Filters/General/TubeFilter" {
  const vtkTubeFilter: { newInstance(): any };
  export default vtkTubeFilter;
}

declare module "@kitware/vtk.js/Filters/Sources/PlaneSource" {
  const vtkPlaneSource: { newInstance(opts?: Record<string, any>): any };
  export default vtkPlaneSource;
}

declare module "@kitware/vtk.js/Filters/Sources/ArrowSource" {
  const vtkArrowSource: { newInstance(): any };
  export default vtkArrowSource;
}

declare module "@kitware/vtk.js/Filters/Sources/ConeSource" {
  const vtkConeSource: { newInstance(opts?: Record<string, any>): any };
  export default vtkConeSource;
}

declare module "@kitware/vtk.js/IO/Geometry/STLReader" {
  const vtkSTLReader: { newInstance(): any };
  export default vtkSTLReader;
}

declare module "@kitware/vtk.js/Filters/Core/PolyDataNormals" {
  const vtkPolyDataNormals: { newInstance(opts?: Record<string, any>): any };
  export default vtkPolyDataNormals;
}

declare module "@kitware/vtk.js/Filters/General/WindowedSincPolyDataFilter" {
  const vtkWindowedSincPolyDataFilter: {
    newInstance(opts?: Record<string, any>): any;
  };
  export default vtkWindowedSincPolyDataFilter;
}

declare module "@kitware/vtk.js/Filters/General/ConnectivityFilter" {
  const vtkConnectivityFilter: { newInstance(opts?: Record<string, any>): any };
  export default vtkConnectivityFilter;
}

declare module "@kitware/vtk.js/Rendering/Misc/FullScreenRenderWindow" {
  const vtkFullScreenRenderWindow: {
    newInstance(opts?: Record<string, any>): any;
  };
  export default vtkFullScreenRenderWindow;
}
