import type { Assets, AtlasImage } from "./assets";
import type { BlendMode, DrawSprite, Material, Shader, UniformValue } from "./rendering-types";

const VIRTUAL_WIDTH = 360;
const VIRTUAL_HEIGHT = 640;
const FLOATS_PER_VERTEX = 4;
const VERTICES_PER_SPRITE = 6;

export type Renderer = {
  render: (commands: readonly DrawSprite[]) => void;
};

type ProgramInfo = {
  program: WebGLProgram;
  uniforms: Map<string, WebGLUniformLocation>;
};

type AtlasTexture = {
  texture: WebGLTexture;
  width: number;
  height: number;
};

function createShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);

  if (!shader) {
    throw new Error("Failed to create WebGL shader.");
  }

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) || "Unknown shader compile error";
    gl.deleteShader(shader);
    throw new Error(log);
  }

  return shader;
}

function createProgram(gl: WebGL2RenderingContext, shader: Shader): WebGLProgram {
  const vertexShader = createShader(gl, gl.VERTEX_SHADER, shader.vertexSource);
  const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, shader.fragmentSource);
  const program = gl.createProgram();

  if (!program) {
    throw new Error("Failed to create WebGL program.");
  }

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) || "Unknown program link error";
    gl.deleteProgram(program);
    throw new Error(log);
  }

  return program;
}

function createProgramInfo(gl: WebGL2RenderingContext, shader: Shader): ProgramInfo {
  const program = createProgram(gl, shader);
  const uniforms = new Map<string, WebGLUniformLocation>();
  const uniformCount = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number;

  for (let index = 0; index < uniformCount; index += 1) {
    const uniform = gl.getActiveUniform(program, index);

    if (!uniform) {
      continue;
    }

    const name = uniform.name.replace(/\[0\]$/, "");
    const location = gl.getUniformLocation(program, name);

    if (location) {
      uniforms.set(name, location);
    }
  }

  return { program, uniforms };
}

function imageSize(image: AtlasImage): { width: number; height: number } {
  return {
    width: image.width,
    height: image.height,
  };
}

function createAtlasTexture(gl: WebGL2RenderingContext, image: AtlasImage): AtlasTexture {
  const texture = gl.createTexture();

  if (!texture) {
    throw new Error("Failed to create atlas texture.");
  }

  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);

  return {
    texture,
    ...imageSize(image),
  };
}

function createVirtualTexture(gl: WebGL2RenderingContext): WebGLTexture {
  const texture = gl.createTexture();

  if (!texture) {
    throw new Error("Failed to create virtual framebuffer texture.");
  }

  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    VIRTUAL_WIDTH,
    VIRTUAL_HEIGHT,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    null,
  );

  return texture;
}

function createFramebuffer(gl: WebGL2RenderingContext, texture: WebGLTexture): WebGLFramebuffer {
  const framebuffer = gl.createFramebuffer();

  if (!framebuffer) {
    throw new Error("Failed to create virtual framebuffer.");
  }

  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
    throw new Error("Virtual framebuffer is incomplete.");
  }

  return framebuffer;
}

function setBlendMode(gl: WebGL2RenderingContext, blendMode: BlendMode): void {
  switch (blendMode) {
    case "opaque": {
      gl.disable(gl.BLEND);
      return;
    }
    case "alpha": {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      return;
    }
    case "additive": {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      return;
    }
  }
}

function setUniform(
  gl: WebGL2RenderingContext,
  location: WebGLUniformLocation,
  value: UniformValue,
): void {
  if (typeof value === "number") {
    gl.uniform1f(location, value);
    return;
  }

  if (typeof value === "boolean") {
    gl.uniform1i(location, value ? 1 : 0);
    return;
  }

  switch (value.length) {
    case 2: {
      gl.uniform2fv(location, value);
      return;
    }
    case 3: {
      gl.uniform3fv(location, value);
      return;
    }
    case 4: {
      gl.uniform4fv(location, value);
      return;
    }
  }
}

function bindMaterial(
  gl: WebGL2RenderingContext,
  programInfo: ProgramInfo,
  material: Material,
): void {
  gl.useProgram(programInfo.program);
  setBlendMode(gl, material.blendMode);

  const atlasLocation = programInfo.uniforms.get("u_atlas");

  if (atlasLocation) {
    gl.uniform1i(atlasLocation, 0);
  }

  for (const [name, value] of Object.entries(material.uniforms)) {
    const location = programInfo.uniforms.get(name);

    if (location) {
      setUniform(gl, location, value);
    }
  }
}

function toClipX(x: number): number {
  return (x / VIRTUAL_WIDTH) * 2 - 1;
}

function toClipY(y: number): number {
  return 1 - (y / VIRTUAL_HEIGHT) * 2;
}

function appendSpriteVertices(vertices: number[], command: DrawSprite, atlas: AtlasTexture): void {
  const { sprite, x, y, scale, rotation } = command;
  const left = toClipX(x);
  const right = toClipX(x + sprite.w * scale);
  const top = toClipY(y);
  const bottom = toClipY(y + sprite.h * scale);
  const uvLeft = sprite.x / atlas.width;
  const uvRight = (sprite.x + sprite.w) / atlas.width;
  const uvTop = sprite.y / atlas.height;
  const uvBottom = (sprite.y + sprite.h) / atlas.height;
  const positions = [
    [left, top],
    [right, top],
    [left, bottom],
    [left, bottom],
    [right, top],
    [right, bottom],
  ];
  const uvsByRotation = [
    [
      [uvLeft, uvTop],
      [uvRight, uvTop],
      [uvLeft, uvBottom],
      [uvLeft, uvBottom],
      [uvRight, uvTop],
      [uvRight, uvBottom],
    ],
    [
      [uvRight, uvTop],
      [uvRight, uvBottom],
      [uvLeft, uvTop],
      [uvLeft, uvTop],
      [uvRight, uvBottom],
      [uvLeft, uvBottom],
    ],
    [
      [uvRight, uvBottom],
      [uvLeft, uvBottom],
      [uvRight, uvTop],
      [uvRight, uvTop],
      [uvLeft, uvBottom],
      [uvLeft, uvTop],
    ],
    [
      [uvLeft, uvBottom],
      [uvLeft, uvTop],
      [uvRight, uvBottom],
      [uvRight, uvBottom],
      [uvLeft, uvTop],
      [uvRight, uvTop],
    ],
  ];
  const uvs = uvsByRotation[rotation];

  for (let index = 0; index < VERTICES_PER_SPRITE; index += 1) {
    vertices.push(positions[index][0], positions[index][1], uvs[index][0], uvs[index][1]);
  }
}

function resizeCanvasToDisplaySize(canvas: HTMLCanvasElement): void {
  const devicePixelRatio = window.devicePixelRatio || 1;
  const width = Math.floor(canvas.clientWidth * devicePixelRatio);
  const height = Math.floor(canvas.clientHeight * devicePixelRatio);

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

export function createRenderer(
  canvas: HTMLCanvasElement,
  { assets }: { assets: Assets },
): Renderer {
  const rawGl = canvas.getContext("webgl2", { alpha: false, antialias: false });

  if (!rawGl) {
    throw new Error("WebGL2 is unavailable.");
  }

  const gl: WebGL2RenderingContext = rawGl;
  const atlasTextures = assets.atlases.map((image) => createAtlasTexture(gl, image));
  const virtualTexture = createVirtualTexture(gl);
  const virtualFramebuffer = createFramebuffer(gl, virtualTexture);
  const vertexArray = gl.createVertexArray();
  const vertexBuffer = gl.createBuffer();
  const programs = new Map<number, ProgramInfo>();

  if (!vertexArray || !vertexBuffer) {
    throw new Error("Failed to create sprite vertex resources.");
  }

  gl.bindVertexArray(vertexArray);
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(
    0,
    2,
    gl.FLOAT,
    false,
    FLOATS_PER_VERTEX * Float32Array.BYTES_PER_ELEMENT,
    0,
  );
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(
    1,
    2,
    gl.FLOAT,
    false,
    FLOATS_PER_VERTEX * Float32Array.BYTES_PER_ELEMENT,
    2 * Float32Array.BYTES_PER_ELEMENT,
  );

  function getProgram(shader: Shader): ProgramInfo {
    const existing = programs.get(shader.id);

    if (existing) {
      return existing;
    }

    const programInfo = createProgramInfo(gl, shader);
    programs.set(shader.id, programInfo);
    return programInfo;
  }

  function drawBatch(commands: readonly DrawSprite[], start: number, end: number): void {
    const first = commands[start];
    const atlas = atlasTextures[first.sprite.atlas];

    if (!atlas) {
      throw new Error(`Missing atlas texture at index ${first.sprite.atlas}.`);
    }

    bindMaterial(gl, getProgram(first.material.shader), first.material);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, atlas.texture);

    const vertices: number[] = [];

    for (let index = start; index < end; index += 1) {
      appendSpriteVertices(vertices, commands[index], atlas);
    }

    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.DYNAMIC_DRAW);
    gl.drawArrays(gl.TRIANGLES, 0, (end - start) * VERTICES_PER_SPRITE);
  }

  return {
    render(commands) {
      resizeCanvasToDisplaySize(canvas);

      gl.bindFramebuffer(gl.FRAMEBUFFER, virtualFramebuffer);
      gl.viewport(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT);
      gl.clearColor(0.07, 0.08, 0.07, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.bindVertexArray(vertexArray);

      let batchStart = 0;

      for (let index = 1; index <= commands.length; index += 1) {
        const previous = commands[index - 1];
        const current = commands[index];
        const batchContinues =
          current &&
          previous.sprite.atlas === current.sprite.atlas &&
          previous.material === current.material;

        if (!batchContinues) {
          drawBatch(commands, batchStart, index);
          batchStart = index;
        }
      }

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, virtualFramebuffer);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);

      const scale = Math.max(
        1,
        Math.floor(Math.min(canvas.width / VIRTUAL_WIDTH, canvas.height / VIRTUAL_HEIGHT)),
      );
      const width = VIRTUAL_WIDTH * scale;
      const height = VIRTUAL_HEIGHT * scale;
      const x = Math.floor((canvas.width - width) / 2);
      const y = Math.floor((canvas.height - height) / 2);

      gl.blitFramebuffer(
        0,
        0,
        VIRTUAL_WIDTH,
        VIRTUAL_HEIGHT,
        x,
        y,
        x + width,
        y + height,
        gl.COLOR_BUFFER_BIT,
        gl.NEAREST,
      );
    },
  };
}
