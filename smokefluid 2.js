// ── COMPACT SHADER SOURCES ───────────────────────────────────────────
const vertShaderSource = `precision highp float;varying vec2 vUv;attribute vec2 a_position;varying vec2 vL,vR,vT,vB;uniform vec2 u_texel;void main(){vUv=.5*(a_position+1.);vL=vUv-vec2(u_texel.x,0.);vR=vUv+vec2(u_texel.x,0.);vT=vUv+vec2(0.,u_texel.y);vB=vUv-vec2(0.,u_texel.y);gl_Position=vec4(a_position,0.,1.);}`;
const fragShaderAdvectionSource = `precision highp float;precision highp sampler2D;varying vec2 vUv;uniform sampler2D u_velocity_texture,u_input_texture;uniform vec2 u_texel;uniform float u_dt;vec4 bilerp(sampler2D sam,vec2 uv,vec2 tsize){vec2 st=uv/tsize-0.5,iuv=floor(st),fuv=fract(st);vec4 a=texture2D(sam,(iuv+vec2(0.5,0.5))*tsize),b=texture2D(sam,(iuv+vec2(1.5,0.5))*tsize),c=texture2D(sam,(iuv+vec2(0.5,1.5))*tsize),d=texture2D(sam,(iuv+vec2(1.5,1.5))*tsize);return mix(mix(a,b,fuv.x),mix(c,d,fuv.x),fuv.y);}void main(){vec2 coord=vUv-u_dt*bilerp(u_velocity_texture,vUv,u_texel).xy*u_texel;gl_FragColor=0.96*bilerp(u_input_texture,coord,u_texel);gl_FragColor.a=1.;}`;
const fragShaderDivergenceSource = `precision highp float;precision highp sampler2D;varying highp vec2 vUv,vL,vR,vT,vB;uniform sampler2D u_velocity_texture;void main(){float L=texture2D(u_velocity_texture,vL).x,R=texture2D(u_velocity_texture,vR).x,T=texture2D(u_velocity_texture,vT).y,B=texture2D(u_velocity_texture,vB).y;gl_FragColor=vec4(.6*(R-L+T-B),0.,0.,1.);}`;
const fragShaderPressureSource = `precision highp float;precision highp sampler2D;varying highp vec2 vUv,vL,vR,vT,vB;uniform sampler2D u_pressure_texture,u_divergence_texture;void main(){float L=texture2D(u_pressure_texture,vL).x,R=texture2D(u_pressure_texture,vR).x,T=texture2D(u_pressure_texture,vT).x,B=texture2D(u_pressure_texture,vB).x;gl_FragColor=vec4((L+R+B+T-texture2D(u_divergence_texture,vUv).x)*0.25,0.,0.,1.);}`;
const fragShaderGradientSubtractSource = `precision highp float;precision highp sampler2D;varying highp vec2 vUv,vL,vR,vT,vB;uniform sampler2D u_pressure_texture,u_velocity_texture;void main(){float L=texture2D(u_pressure_texture,vL).x,R=texture2D(u_pressure_texture,vR).x,T=texture2D(u_pressure_texture,vT).x,B=texture2D(u_pressure_texture,vB).x;vec2 velocity=texture2D(u_velocity_texture,vUv).xy;gl_FragColor=vec4(velocity-vec2(R-L,T-B),0.,1.);}`;
const fragShaderPointSource = `precision highp float;precision highp sampler2D;varying vec2 vUv;uniform sampler2D u_input_texture;uniform float u_ratio,u_point_size;uniform vec3 u_point_value;uniform vec2 u_point;void main(){vec2 p=vUv-u_point.xy;p.x*=u_ratio;gl_FragColor=vec4(texture2D(u_input_texture,vUv).xyz+pow(2.,-dot(p,p)/u_point_size)*u_point_value,1.);}`;
const fragShaderOutputShaderSource = `precision highp float;precision highp sampler2D;varying vec2 vUv;uniform sampler2D u_output_texture;void main(){gl_FragColor=vec4(texture2D(u_output_texture,vUv).rgb,1.);}`;

// ── MAIN CORE EXECUTION ─────────────────────────────────────────────
const canvasEl = document.querySelector("canvas");
const CONFIG = { color: { r: 0.957, g: 0.933, b: 0.902 } };
const pointer = { x: 0, y: 0, dx: 0, dy: 0, moved: false };
let outputColor, velocity, divergence, pressure, pointerSize = 0.005, isPreview = true;

const gl = canvasEl.getContext("webgl");
if (!gl.getExtension("OES_texture_float")) alert("OES_texture_float not supported.");

const vertexShader = createShader(vertShaderSource, gl.VERTEX_SHADER);
const splatProgram = createProgram(fragShaderPointSource);
const divergenceProgram = createProgram(fragShaderDivergenceSource);
const pressureProgram = createProgram(fragShaderPressureSource);
const gradientSubtractProgram = createProgram(fragShaderGradientSubtractSource);
const advectionProgram = createProgram(fragShaderAdvectionSource);
const outputShaderProgram = createProgram(fragShaderOutputShaderSource);

gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,-1,1,1,1,1,-1]), gl.STATIC_DRAW);
gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0,1,2,0,2,3]), gl.STATIC_DRAW);
gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
gl.enableVertexAttribArray(0);

initFBOs(); setupEvents(); resizeCanvas();
window.addEventListener("resize", resizeCanvas);
requestAnimationFrame(render);

function createProgram(src) {
    const s = createShader(src, gl.FRAGMENT_SHADER), p = gl.createProgram();
    gl.attachShader(p, vertexShader); gl.attachShader(p, s); gl.linkProgram(p);
    let u = [], c = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < c; i++) { let n = gl.getActiveUniform(p, i).name; u[n] = gl.getUniformLocation(p, n); }
    return { program: p, uniforms: u };
}
function createShader(src, t) {
    const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s); return s;
}
function blit(t) {
    if (t == null) { gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight); gl.bindFramebuffer(gl.FRAMEBUFFER, null); } 
    else { gl.viewport(0, 0, t.width, t.height); gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo); }
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
}
function initFBOs() {
    const w = Math.floor(.5 * window.innerWidth), h = Math.floor(.5 * window.innerHeight);
    outputColor = createDoubleFBO(w, h); velocity = createDoubleFBO(w, h); divergence = createFBO(w, h); pressure = createDoubleFBO(w, h);
}
function createFBO(w, h) {
    gl.activeTexture(gl.TEXTURE0); const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.FLOAT, null);
    const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    gl.viewport(0, 0, w, h); gl.clear(gl.COLOR_BUFFER_BIT);
    return { fbo: f, width: w, height: h, attach(id) { gl.activeTexture(gl.TEXTURE0 + id); gl.bindTexture(gl.TEXTURE_2D, t); return id; } };
}
function createDoubleFBO(w, h) {
    let f1 = createFBO(w, h), f2 = createFBO(w, h);
    return { width: w, height: h, texelSizeX: 1./w, texelSizeY: 1./h, read: () => f1, write: () => f2, swap() { let t = f1; f1 = f2; f2 = t; } }
}
function render(t) {
    const dt = 1 / 60;
    if (t && isPreview) {
        updateMousePosition((.5 - .45 * Math.sin(.003 * t - 2)) * window.innerWidth, (.5 + .1 * Math.sin(.0025 * t) + .1 * Math.cos(.002 * t)) * window.innerHeight);
    }
    gl.uniform2f(splatProgram.uniforms.u_texel, velocity.texelSizeX, velocity.texelSizeY);
    if (pointer.moved) {
        if (!isPreview) pointer.moved = false;
        gl.useProgram(splatProgram.program);
        gl.uniform1i(splatProgram.uniforms.u_input_texture, velocity.read().attach(1));
        gl.uniform1f(splatProgram.uniforms.u_ratio, canvasEl.width / canvasEl.height);
        gl.uniform2f(splatProgram.uniforms.u_point, pointer.x / canvasEl.width, 1 - pointer.y / canvasEl.height);
        gl.uniform3f(splatProgram.uniforms.u_point_value, pointer.dx, -pointer.dy, 1);
        gl.uniform1f(splatProgram.uniforms.u_point_size, pointerSize);
        blit(velocity.write()); velocity.swap();
        gl.uniform1i(splatProgram.uniforms.u_input_texture, outputColor.read().attach(1));
        gl.uniform3f(splatProgram.uniforms.u_point_value, 1. - CONFIG.color.r, 1. - CONFIG.color.g, 1. - CONFIG.color.b);
        blit(outputColor.write()); outputColor.swap();
    }
    gl.useProgram(divergenceProgram.program);
    gl.uniform2f(divergenceProgram.uniforms.u_texel, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(divergenceProgram.uniforms.u_velocity_texture, velocity.read().attach(1));
    blit(divergence);
    gl.useProgram(pressureProgram.program);
    gl.uniform2f(pressureProgram.uniforms.u_texel, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(pressureProgram.uniforms.u_divergence_texture, divergence.attach(1));
    for (let i = 0; i < 10; i++) {
        gl.uniform1i(pressureProgram.uniforms.u_pressure_texture, pressure.read().attach(2));
        blit(pressure.write()); pressure.swap();
    }
    gl.useProgram(gradientSubtractProgram.program);
    gl.uniform2f(gradientSubtractProgram.uniforms.u_texel, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(gradientSubtractProgram.uniforms.u_pressure_texture, pressure.read().attach(1));
    gl.uniform1i(gradientSubtractProgram.uniforms.u_velocity_texture, velocity.read().attach(2));
    blit(velocity.write()); velocity.swap();
    gl.useProgram(advectionProgram.program);
    gl.uniform2f(advectionProgram.uniforms.u_texel, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(advectionProgram.uniforms.u_velocity_texture, velocity.read().attach(1));
    gl.uniform1i(advectionProgram.uniforms.u_input_texture, velocity.read().attach(1));
    gl.uniform1f(advectionProgram.uniforms.u_dt, dt);
    blit(velocity.write()); velocity.swap();
    gl.useProgram(advectionProgram.program);
    gl.uniform2f(advectionProgram.uniforms.u_texel, outputColor.texelSizeX, outputColor.texelSizeY);
    gl.uniform1i(advectionProgram.uniforms.u_input_texture, outputColor.read().attach(2));
    blit(outputColor.write()); outputColor.swap();
    gl.useProgram(outputShaderProgram.program);
    gl.uniform1i(outputShaderProgram.uniforms.u_output_texture, outputColor.read().attach(1));
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    requestAnimationFrame(render);
}
function resizeCanvas() {
    pointerSize = 4 / window.innerHeight;
    canvasEl.width = window.innerWidth; canvasEl.height = window.innerHeight;
    initFBOs();
}
function setupEvents() {
    window.addEventListener("mousemove", (e) => { isPreview = false; updateMousePosition(e.clientX, e.clientY); });
    window.addEventListener("touchmove", (e) => { isPreview = false; updateMousePosition(e.targetTouches[0].clientX, e.targetTouches[0].clientY); }, { passive: true });
}
function updateMousePosition(eX, eY) {
    pointer.moved = true; pointer.dx = 5 * (eX - pointer.x); pointer.dy = 5 * (eY - pointer.y); pointer.x = eX; pointer.y = eY;
}