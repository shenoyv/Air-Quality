var fromDay = undefined;
var toDay = undefined;
var LegendOptions = [];
function myFunction() {
	LegendOptions = [];
	fromDay = document.getElementById("Day1").value;
	LegendOptions.push(fromDay);
    toDay = document.getElementById("Day2").value;
	LegendOptions.push(toDay);
	var newArray = d.filter(function(item) {
	  return item[0].day === fromDay;
	});
	var newArray1 = d.filter(function(item) {
	  if(item[0].day === toDay){
		newArray.push(item);
	  }
	  return item[0].day === toDay;
	});
var w = 500,
	h = 500;
var colorscale = d3.scale.category10();

	var mycfg = {
     w: w,
     h: h,
     maxValue: 0.3,
     levels: 6,
     ExtraWidthX: 300
     }
	  
var divstyle = document.getElementById("myDIV");
if (divstyle.style.display === "none" || divstyle.style.display === "block") {
divstyle.style.display = "block";
			

const canvas = document.getElementsByTagName('canvas')[0];
canvas.width = canvas.clientWidth;
canvas.height = canvas.clientHeight;

const params = { alpha: false, depth: false, stencil: false, antialias: false };
let gl = canvas.getContext('webgl2', params);
const isWebGL2 = !!gl;
if (!isWebGL2) {
    gl = canvas.getContext('webgl', params) || canvas.getContext('experimental-webgl', params);
}
gl.clearColor(0.0, 0.0, 0.0, 1.0);

const halfFloat = gl.getExtension('OES_texture_half_float');
let support_linear_float = gl.getExtension('OES_texture_half_float_linear');
if (isWebGL2) {
    gl.getExtension('EXT_color_buffer_float');
    support_linear_float = gl.getExtension('OES_texture_float_linear');
}

const TEXTURE_DOWNSAMPLE = 1;
const DENSITY_DISSIPATION = 0.98;
const VELOCITY_DISSIPATION = 0.99;
const SPLAT_RADIUS = 0.005;
const CURL = 30;
const PRESSURE_ITERATIONS = 25;

class GLProgram {
    constructor (vertexShader, fragmentShader) {
        this.uniforms = {};
        this.program = gl.createProgram();

        gl.attachShader(this.program, vertexShader);
        gl.attachShader(this.program, fragmentShader);
        gl.linkProgram(this.program);

        if (!gl.getProgramParameter(this.program, gl.LINK_STATUS))
            throw gl.getProgramInfoLog(this.program);

        const uniformCount = gl.getProgramParameter(this.program, gl.ACTIVE_UNIFORMS);
        for (let i = 0; i < uniformCount; i++) {
            const uniformName = gl.getActiveUniform(this.program, i).name;
            this.uniforms[uniformName] = gl.getUniformLocation(this.program, uniformName);
        }
    }

    bind () {
        gl.useProgram(this.program);
    }
}

function compileShader (type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
        throw gl.getShaderInfoLog(shader);

    return shader;
};

const baseVertexShader = compileShader(gl.VERTEX_SHADER, `
    precision highp float;
    precision mediump sampler2D;

    attribute vec2 aPosition;
    varying vec2 vUv;
    varying vec2 vL;
    varying vec2 vR;
    varying vec2 vT;
    varying vec2 vB;
    uniform vec2 texelSize;

    void main () {
        vUv = aPosition * 0.5 + 0.5;
        vL = vUv - vec2(texelSize.x, 0.0);
        vR = vUv + vec2(texelSize.x, 0.0);
        vT = vUv + vec2(0.0, texelSize.y);
        vB = vUv - vec2(0.0, texelSize.y);
        gl_Position = vec4(aPosition, 0.0, 1.0);
    }
`);

const displayShader = compileShader(gl.FRAGMENT_SHADER, `
    precision highp float;
    precision mediump sampler2D;

    varying vec2 vUv;
    varying vec2 vL;
    varying vec2 vR;
    varying vec2 vT;
    varying vec2 vB;
    uniform sampler2D uTexture;

    void main () {
        gl_FragColor = texture2D(uTexture, vUv);
    }
`);

const splatShader = compileShader(gl.FRAGMENT_SHADER, `
    precision highp float;
    precision mediump sampler2D;

    varying vec2 vUv;
    uniform sampler2D uTarget;
    uniform float aspectRatio;
    uniform vec3 color;
    uniform vec2 point;
    uniform float radius;

    void main () {
        vec2 p = vUv - point.xy;
        p.x *= aspectRatio;
        vec3 splat = exp(-dot(p, p) / radius) * color;
        vec3 base = texture2D(uTarget, vUv).xyz;
        gl_FragColor = vec4(base + splat, 1.0);
    }
`);

const advectionManualFilteringShader = compileShader(gl.FRAGMENT_SHADER, `
    precision highp float;
    precision mediump sampler2D;

    varying vec2 vUv;
    uniform sampler2D uVelocity;
    uniform sampler2D uSource;
    uniform vec2 texelSize;
    uniform float dt;
    uniform float dissipation;

    vec4 bilerp (in sampler2D sam, in vec2 p) {
        vec4 st;
        st.xy = floor(p - 0.5) + 0.5;
        st.zw = st.xy + 1.0;
        vec4 uv = st * texelSize.xyxy;
        vec4 a = texture2D(sam, uv.xy);
        vec4 b = texture2D(sam, uv.zy);
        vec4 c = texture2D(sam, uv.xw);
        vec4 d = texture2D(sam, uv.zw);
        vec2 f = p - st.xy;
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
    }

    void main () {
        vec2 coord = gl_FragCoord.xy - dt * texture2D(uVelocity, vUv).xy;
        gl_FragColor = dissipation * bilerp(uSource, coord);
        gl_FragColor.a = 1.0;
    }
`);

const advectionShader = compileShader(gl.FRAGMENT_SHADER, `
    precision highp float;
    precision mediump sampler2D;

    varying vec2 vUv;
    uniform sampler2D uVelocity;
    uniform sampler2D uSource;
    uniform vec2 texelSize;
    uniform float dt;
    uniform float dissipation;

    void main () {
        vec2 coord = vUv - dt * texture2D(uVelocity, vUv).xy * texelSize;
        gl_FragColor = dissipation * texture2D(uSource, coord);
    }
`);

const divergenceShader = compileShader(gl.FRAGMENT_SHADER, `
    precision highp float;
    precision mediump sampler2D;

    varying vec2 vUv;
    varying vec2 vL;
    varying vec2 vR;
    varying vec2 vT;
    varying vec2 vB;
    uniform sampler2D uVelocity;

    vec2 sampleVelocity (in vec2 uv) {
        vec2 multiplier = vec2(1.0, 1.0);
        if (uv.x < 0.0) { uv.x = 0.0; multiplier.x = -1.0; }
        if (uv.x > 1.0) { uv.x = 1.0; multiplier.x = -1.0; }
        if (uv.y < 0.0) { uv.y = 0.0; multiplier.y = -1.0; }
        if (uv.y > 1.0) { uv.y = 1.0; multiplier.y = -1.0; }
        return multiplier * texture2D(uVelocity, uv).xy;
    }

    void main () {
        float L = sampleVelocity(vL).x;
        float R = sampleVelocity(vR).x;
        float T = sampleVelocity(vT).y;
        float B = sampleVelocity(vB).y;
        float div = 0.5 * (R - L + T - B);
        gl_FragColor = vec4(div, 0.0, 0.0, 1.0);
    }
`);

const curlShader = compileShader(gl.FRAGMENT_SHADER, `
    precision highp float;
    precision mediump sampler2D;

    varying vec2 vUv;
    varying vec2 vL;
    varying vec2 vR;
    varying vec2 vT;
    varying vec2 vB;
    uniform sampler2D uVelocity;

    void main () {
        float L = texture2D(uVelocity, vL).y;
        float R = texture2D(uVelocity, vR).y;
        float T = texture2D(uVelocity, vT).x;
        float B = texture2D(uVelocity, vB).x;
        float vorticity = R - L - T + B;
        gl_FragColor = vec4(vorticity, 0.0, 0.0, 1.0);
    }
`);

const vorticityShader = compileShader(gl.FRAGMENT_SHADER, `
    precision highp float;
    precision mediump sampler2D;

    varying vec2 vUv;
    varying vec2 vL;
    varying vec2 vR;
    varying vec2 vT;
    varying vec2 vB;
    uniform sampler2D uVelocity;
    uniform sampler2D uCurl;
    uniform float curl;
    uniform float dt;

    void main () {
        float L = texture2D(uCurl, vL).y;
        float R = texture2D(uCurl, vR).y;
        float T = texture2D(uCurl, vT).x;
        float B = texture2D(uCurl, vB).x;
        float C = texture2D(uCurl, vUv).x;
        vec2 force = vec2(abs(T) - abs(B), abs(R) - abs(L));
        force *= 1.0 / length(force + 0.00001) * curl * C;
        vec2 vel = texture2D(uVelocity, vUv).xy;
        gl_FragColor = vec4(vel + force * dt, 0.0, 1.0);
    }
`);

const pressureShader = compileShader(gl.FRAGMENT_SHADER, `
    precision highp float;
    precision mediump sampler2D;

    varying vec2 vUv;
    varying vec2 vL;
    varying vec2 vR;
    varying vec2 vT;
    varying vec2 vB;
    uniform sampler2D uPressure;
    uniform sampler2D uDivergence;

    vec2 boundary (in vec2 uv) {
        uv = min(max(uv, 0.0), 1.0);
        return uv;
    }

    void main () {
        float L = texture2D(uPressure, boundary(vL)).x;
        float R = texture2D(uPressure, boundary(vR)).x;
        float T = texture2D(uPressure, boundary(vT)).x;
        float B = texture2D(uPressure, boundary(vB)).x;
        float C = texture2D(uPressure, vUv).x;
        float divergence = texture2D(uDivergence, vUv).x;
        float pressure = (L + R + B + T - divergence) * 0.25;
        gl_FragColor = vec4(pressure, 0.0, 0.0, 1.0);
    }
`);

const gradientSubtractShader = compileShader(gl.FRAGMENT_SHADER, `
    precision highp float;
    precision mediump sampler2D;

    varying vec2 vUv;
    varying vec2 vL;
    varying vec2 vR;
    varying vec2 vT;
    varying vec2 vB;
    uniform sampler2D uPressure;
    uniform sampler2D uVelocity;

    vec2 boundary (in vec2 uv) {
        uv = min(max(uv, 0.0), 1.0);
        return uv;
    }

    void main () {
        float L = texture2D(uPressure, boundary(vL)).x;
        float R = texture2D(uPressure, boundary(vR)).x;
        float T = texture2D(uPressure, boundary(vT)).x;
        float B = texture2D(uPressure, boundary(vB)).x;
        vec2 velocity = texture2D(uVelocity, vUv).xy;
        velocity.xy -= vec2(R - L, T - B);
        gl_FragColor = vec4(velocity, 0.0, 1.0);
    }
`);

const blit = (() => {
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(0);

    return (destination) => {
        gl.bindFramebuffer(gl.FRAMEBUFFER, destination);
        gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    }
})();

function clear (target) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, target);
    gl.clear(gl.COLOR_BUFFER_BIT);
}

function createFBO (texId, w, h, internalFormat, format, type, param) {
    gl.activeTexture(gl.TEXTURE0 + texId);
    let texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, param);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, param);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, null);

    let fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.viewport(0, 0, w, h);
    gl.clear(gl.COLOR_BUFFER_BIT);

    return [texture, fbo, texId];
}

function createDoubleFBO (texId, w, h, internalFormat, format, type, param) {
    let fbo1 = createFBO(texId    , w, h, internalFormat, format, type, param);
    let fbo2 = createFBO(texId + 1, w, h, internalFormat, format, type, param);

    return {
        get first () {
            return fbo1;
        },
        get second () {
            return fbo2;
        },
        swap: () => {
            let temp = fbo1;
            fbo1 = fbo2;
            fbo2 = temp;
        }
    }
}

let textureWidth;
let textureHeight;
let density;
let velocity;
let divergence;
let curl;
let pressure;

function initFramebuffers () {
    textureWidth = gl.drawingBufferWidth >> TEXTURE_DOWNSAMPLE;
    textureHeight = gl.drawingBufferHeight >> TEXTURE_DOWNSAMPLE;

    const internalFormat = isWebGL2 ? gl.RGBA16F : gl.RGBA;
    const internalFormatRG = isWebGL2 ? gl.RG16F : gl.RGBA;
    const formatRG = isWebGL2 ? gl.RG : gl.RGBA;
    const texType = isWebGL2 ? gl.HALF_FLOAT : halfFloat.HALF_FLOAT_OES;

    density    = createDoubleFBO(0, textureWidth, textureHeight, internalFormat  , gl.RGBA , texType, support_linear_float ? gl.LINEAR : gl.NEAREST);
    velocity   = createDoubleFBO(2, textureWidth, textureHeight, internalFormatRG, formatRG, texType, support_linear_float ? gl.LINEAR : gl.NEAREST);
    divergence = createFBO      (4, textureWidth, textureHeight, internalFormatRG, formatRG, texType, gl.NEAREST);
    curl       = createFBO      (5, textureWidth, textureHeight, internalFormatRG, formatRG, texType, gl.NEAREST);
    pressure   = createDoubleFBO(6, textureWidth, textureHeight, internalFormatRG, formatRG, texType, gl.NEAREST);
}

initFramebuffers();

const displayProgram = new GLProgram(baseVertexShader, displayShader);
const splatProgram = new GLProgram(baseVertexShader, splatShader);
const advectionProgram = new GLProgram(baseVertexShader, support_linear_float ? advectionShader : advectionManualFilteringShader);
const divergenceProgram = new GLProgram(baseVertexShader, divergenceShader);
const curlProgram = new GLProgram(baseVertexShader, curlShader);
const vorticityProgram = new GLProgram(baseVertexShader, vorticityShader);
const pressureProgram = new GLProgram(baseVertexShader, pressureShader);
const gradienSubtractProgram = new GLProgram(baseVertexShader, gradientSubtractShader);

function pointerPrototype () {
    this.id = -1;
    this.x = 0;
    this.y = 0;
    this.dx = 0;
    this.dy = 0;
    this.down = false;
    this.moved = false;
    this.color = [30, 0, 300];
}

let pointers = [];
pointers.push(new pointerPrototype());

for (let i = 0; i < 10; i++) {
    const color = [Math.random() * 10, Math.random() * 10, Math.random() * 10];
    const x = canvas.width * Math.random();
    const y = canvas.height * Math.random();
    const dx = 1000 * (Math.random() - 0.5);
    const dy = 1000 * (Math.random() - 0.5);
    splat(x, y, dx, dy, color);
}

let lastTime = Date.now();
Update();

function Update () {
    resizeCanvas();

    const dt = Math.min((Date.now() - lastTime) / 1000, 0.016);
    lastTime = Date.now();

    gl.viewport(0, 0, textureWidth, textureHeight);

    advectionProgram.bind();
    gl.uniform2f(advectionProgram.uniforms.texelSize, 1.0 / textureWidth, 1.0 / textureHeight);
    gl.uniform1i(advectionProgram.uniforms.uVelocity, velocity.first[2]);
    gl.uniform1i(advectionProgram.uniforms.uSource, velocity.first[2]);
    gl.uniform1f(advectionProgram.uniforms.dt, dt);
    gl.uniform1f(advectionProgram.uniforms.dissipation, VELOCITY_DISSIPATION);
    blit(velocity.second[1]);
    velocity.swap();

    gl.uniform1i(advectionProgram.uniforms.uVelocity, velocity.first[2]);
    gl.uniform1i(advectionProgram.uniforms.uSource, density.first[2]);
    gl.uniform1f(advectionProgram.uniforms.dissipation, DENSITY_DISSIPATION);
    blit(density.second[1]);
    density.swap();

    for (let i = 0; i < pointers.length; i++) {
        const pointer = pointers[i];
        if (pointer.moved) {
            splat(pointer.x, pointer.y, pointer.dx, pointer.dy, pointer.color);
            pointer.moved = false;
        }
    }

    curlProgram.bind();
    gl.uniform2f(curlProgram.uniforms.texelSize, 1.0 / textureWidth, 1.0 / textureHeight);
    gl.uniform1i(curlProgram.uniforms.uVelocity, velocity.first[2]);
    blit(curl[1]);

    vorticityProgram.bind();
    gl.uniform2f(vorticityProgram.uniforms.texelSize, 1.0 / textureWidth, 1.0 / textureHeight);
    gl.uniform1i(vorticityProgram.uniforms.uVelocity, velocity.first[2]);
    gl.uniform1i(vorticityProgram.uniforms.uCurl, curl[2]);
    gl.uniform1f(vorticityProgram.uniforms.curl, CURL);
    gl.uniform1f(vorticityProgram.uniforms.dt, dt);
    blit(velocity.second[1]);
    velocity.swap();

    divergenceProgram.bind();
    gl.uniform2f(divergenceProgram.uniforms.texelSize, 1.0 / textureWidth, 1.0 / textureHeight);
    gl.uniform1i(divergenceProgram.uniforms.uVelocity, velocity.first[2]);
    blit(divergence[1]);

    clear(pressure.first[1]);
    pressureProgram.bind();
    gl.uniform2f(pressureProgram.uniforms.texelSize, 1.0 / textureWidth, 1.0 / textureHeight);
    gl.uniform1i(pressureProgram.uniforms.uDivergence, divergence[2]);
    for (let i = 0; i < PRESSURE_ITERATIONS; i++) {
        gl.uniform1i(pressureProgram.uniforms.uPressure, pressure.first[2]);
        blit(pressure.second[1]);
        pressure.swap();
    }

    gradienSubtractProgram.bind();
    gl.uniform2f(gradienSubtractProgram.uniforms.texelSize, 1.0 / textureWidth, 1.0 / textureHeight);
    gl.uniform1i(gradienSubtractProgram.uniforms.uPressure, pressure.first[2]);
    gl.uniform1i(gradienSubtractProgram.uniforms.uVelocity, velocity.first[2]);
    blit(velocity.second[1]);
    velocity.swap();

    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    displayProgram.bind();
    gl.uniform1i(displayProgram.uniforms.uTexture, density.first[2]);
    blit(null);

    requestAnimationFrame(Update);
}

function splat (x, y, dx, dy, color) {
    splatProgram.bind();
    gl.uniform1i(splatProgram.uniforms.uTarget, velocity.first[2]);
    gl.uniform1f(splatProgram.uniforms.aspectRatio, canvas.width / canvas.height);
    gl.uniform2f(splatProgram.uniforms.point, x / canvas.width, 1.0 - y / canvas.height);
    gl.uniform3f(splatProgram.uniforms.color, dx, -dy, 1.0);
    gl.uniform1f(splatProgram.uniforms.radius, SPLAT_RADIUS);
    blit(velocity.second[1]);
    velocity.swap();

    gl.uniform1i(splatProgram.uniforms.uTarget, density.first[2]);
    gl.uniform3f(splatProgram.uniforms.color, color[0] * 0.3, color[1] * 0.3, color[2] * 0.3);
    blit(density.second[1]);
    density.swap();
}

function resizeCanvas () {
    if (canvas.width != canvas.clientWidth || canvas.height != canvas.clientHeight) {
        canvas.width = canvas.clientWidth;
        canvas.height = canvas.clientHeight;
        initFramebuffers();
    }
}

canvas.addEventListener('mousemove', (e) => {
    pointers[0].moved = pointers[0].down;
    pointers[0].dx = (e.offsetX - pointers[0].x) * 10.0;
    pointers[0].dy = (e.offsetY - pointers[0].y) * 10.0;
    pointers[0].x = e.offsetX;
    pointers[0].y = e.offsetY;
});

canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    const touches = e.targetTouches;
    for (let i = 0; i < e.touches.length; i++) {
        let pointer = pointers[i];
        pointer.moved = pointer.down;
        pointer.dx = (touches[i].pageX - pointer.x) * 10.0;
        pointer.dy = (touches[i].pageY - pointer.y) * 10.0;
        pointer.x = touches[i].pageX;
        pointer.y = touches[i].pageY;
    }
}, false);

canvas.addEventListener('mousedown', () => {
    pointers[0].down = true;
    pointers[0].color = [Math.random() + 0.2, Math.random() + 0.2, Math.random() + 0.2];
    pointers[0].color = [0.2, 0.2, 1];
});

canvas.addEventListener('touchstart', (e) => {
    const touches = e.targetTouches;
    for (let i = 0; i < touches.length; i++) {
        if (i >= pointers.length)
            pointers.push(new pointerPrototype());

        pointers[i].id = touches[i].identifier;
        pointers[i].down = true;
        pointers[i].x = touches[i].pageX;
        pointers[i].y = touches[i].pageY;
        pointers[i].color = [Math.random() + 0.2, Math.random() + 0.2, Math.random() + 0.2];
    }
});

window.addEventListener('mouseup', () => {
    pointers[0].down = false;
});

window.addEventListener('touchend', (e) => {
    const touches = e.changedTouches;
    for (let i = 0; i < touches.length; i++)
        for (let j = 0; j < pointers.length; j++)
            if (touches[i].identifier == pointers[j].id)
                pointers[j].down = false;
});
		} else {
			x.style.display = "none";
		}
	RadarChart.draw("#chart", newArray, mycfg);
	var svg = d3.select('#body')
	.selectAll('svg')
	.append('svg');
	//Initiate Legend	
    var legend = svg.append("g")
	.attr("class", "legend")
	.attr("height", 100)
	.attr("width", 200)
	.attr("color", "white")
	.attr('transform', 'translate(90,20)');

	var text = svg.append("text")
	.attr("class", "title")
	.attr('transform', 'translate(90,0)') 
	.attr("x", w - 70)
	.attr("y", 10)
	.attr("font-size", "12px")
	.attr("fill", "white")
	.text("Air pollutants present in the Coleraine Street,Dublin  ");
		

	//used to Create colour squares
	legend.selectAll('rect')
	  .data(LegendOptions)
	  .enter()
	  .append("rect")
	  .attr("x", w - 65)
	  .attr("y", function(d, i){ return i * 20;})
	  .attr("width", 10)
	  .attr("height", 10)
	  .style("fill", function(d, i){ return colorscale(i);})
	  ;
	//used to create text next to squares
	legend.selectAll('text')
	  .data(LegendOptions)
	  .enter()
	  .append("text")
	  .attr("x", w - 52)
	  .attr("y", function(d, i){ return i * 20 + 9;})
	  .attr("font-size", "11px")
	  .attr("fill", "#737373")
	  .text(function(d) { return d; })
	  ;	
}
//The data
var d = [
		  [
			{axis:"Nitrogen dioxide",value:0.22,day :"Day 1"},
			{axis:"Nitrogen Oxide",value:0.06,day :"Day 1"},
			{axis:"PM 2.5",value:0.17,day :"Day 1"},
			{axis:"Sulphur oxide",value:0.009,day :"Day 1"},
			{axis:"Carbon dioxide",value:0.20,day :"Day 1"},
			
		  ],[
			{axis:"Nitrogen dioxide",value:0.28,day:"Day 2"},
			{axis:"Nitrogen Oxide",value:0.08,day : "Day 2 "},
			{axis:"PM 2.5",value:0.089, day : "Day 2 "},
			{axis:"Sulphur oxide",value:0.005,day : "Day 2 "},
			{axis:"Carbon dioxide",value:0.13,day : "Day 2 "},
			
		  ],
		  [
			{axis:"Nitrogen dioxide",value:0.45,day:"Day 3"},
			{axis:"Nitrogen Oxide",value:0.31,day : "Day 3 "},
			{axis:"PM 2.5",value:0.18, day : "Day 3 "},
			{axis:"Sulphur oxide",value:0.009,day : "Day 3 "},
			{axis:"Carbon dioxide",value:0.23,day : "Day 3 "},
			],
		  [
			{axis:"Nitrogen dioxide",value:0.27,day:"Day 4"},
			{axis:"Nitrogen Oxide",value:0.11,day : "Day 4 "},
			{axis:"PM 2.5",value:0.09, day : "Day 4 "},
			{axis:"Sulphur oxide",value:0.004,day : "Day 4 "},
			{axis:"Carbon dioxide",value:0.10,day : "Day 4 "},
			],
		  [
			{axis:"Nitrogen dioxide",value:0.34,day:"Day 5"},
			{axis:"Nitrogen Oxide",value:0.16,day : "Day 5 "},
			{axis:"PM 2.5",value:0.10, day : "Day 5"},
			{axis:"Sulphur oxide",value:0.006,day : "Day 5"},
			{axis:"Carbon dioxide",value:0.13,day : "Day 5 "},
			],
		 
		  [
			{axis:"Nitrogen dioxide",value:0.62,day:"Day 6"},
			{axis:"Nitrogen Oxide",value:0.11,day : "Day 6 "},
			{axis:"PM 2.5",value:0.32, day : "Day 6"},
			{axis:"Sulphur oxide",value:0.008,day : "Day 6"},
			{axis:"Carbon dioxide",value:0.37,day : "Day 6 "},
			],
		 [
			{axis:"Nitrogen dioxide",value:0.50,day:"Day 7"},
			{axis:"Nitrogen Oxide",value:0.62,day : "Day 7 "},
			{axis:"PM 2.5",value:0.19, day : "Day 7"},
			{axis:"Sulphur oxide",value:0.23,day : "Day 7"},
			{axis:"Carbon dioxide",value:0.28,day : "Day 7"},
			],
			
		 [
			{axis:"Nitrogen dioxide",value:0.19,day:"Day 8"},
			{axis:"Nitrogen Oxide",value:0.08,day : "Day 8 "},
			{axis:"PM 2.5",value:0.10, day : "Day 8"},
			{axis:"Sulphur oxide",value:0.21,day : "Day 8"},
			{axis:"Carbon dioxide",value:0.09,day : "Day 8"},
			],
		 [
			{axis:"Nitrogen dioxide",value:0.27,day:"Day 9"},
			{axis:"Nitrogen Oxide",value:0.13,day : "Day 9 "},
			{axis:"PM 2.5",value:0.12, day : "Day 9"},
			{axis:"Sulphur oxide",value:0.0007,day : "Day 9"},
			{axis:"Carbon dioxide",value:0.13,day : "Day 9"},
			],
		
		[
			{axis:"Nitrogen dioxide",value:0.34,day:"Day 10"},
			{axis:"Nitrogen Oxide",value:0.25,day : "Day 10 "},
			{axis:"PM 2.5",value:0.11, day : "Day 10"},
			{axis:"Sulphur oxide",value:0.21,day : "Day 10"},
			{axis:"Carbon dioxide",value:0.11,day : "Day 10"},
			],
		[
			{axis:"Nitrogen dioxide",value:0.36,day:"Day 11"},
			{axis:"Nitrogen Oxide",value:0.21,day : "Day 11 "},
			{axis:"PM 2.5",value:0.06, day : "Day 11"},
			{axis:"Sulphur oxide",value:0.0013,day : "Day 11"},
			{axis:"Carbon dioxide",value:0.11,day : "Day 11"},
			],
		
		[
			{axis:"Nitrogen dioxide",value:0.36,day:"Day 12"},
			{axis:"Nitrogen Oxide",value:0.24,day : "Day 12 "},
			{axis:"PM 2.5",value:0.12, day : "Day 12"},
			{axis:"Sulphur oxide",value:0.0002,day : "Day 12"},
			{axis:"Carbon dioxide",value:0.36,day : "Day 12"},
			],
		
		[
			{axis:"Nitrogen dioxide",value:0.18,day:"Day 13"},
			{axis:"Nitrogen Oxide",value:0.08,day : "Day 13 "},
			{axis:"PM 2.5",value:0.09, day : "Day 13"},
			{axis:"Sulphur oxide",value:0.0004,day : "Day 13"},
			{axis:"Carbon dioxide",value:0.14,day : "Day 13"},
			],
		
		[
			{axis:"Nitrogen dioxide",value:0.05,day:"Day 14"},
			{axis:"Nitrogen Oxide",value:0.02,day : "Day 14 "},
			{axis:"PM 2.5",value:0.02, day : "Day 14"},
			{axis:"Sulphur oxide",value:0.00012,day : "Day 14"},
			{axis:"Carbon dioxide",value:0.07,day : "Day 14"},
			],
		[
			{axis:"Nitrogen dioxide",value:0.12,day:"Day 15"},
			{axis:"Nitrogen Oxide",value:0.04,day : "Day 15 "},
			{axis:"PM 2.5",value:0.05, day : "Day 15"},
			{axis:"Sulphur oxide",value:0.0008,day : "Day 15"},
			{axis:"Carbon dioxide",value:0.15,day : "Day 15"},
			],
		
		[
			{axis:"Nitrogen dioxide",value:0.54,day:"Day 16"},
			{axis:"Nitrogen Oxide",value:0.09,day : "Day 16 "},
			{axis:"PM 2.5",value:0.18, day : "Day 16"},
			{axis:"Sulphur oxide",value:0.007,day : "Day 16"},
			{axis:"Carbon dioxide",value:0.29,day : "Day 16"},
			],
		[
			{axis:"Nitrogen dioxide",value:0.43,day:"Day 17"},
			{axis:"Nitrogen Oxide",value:0.45,day : "Day 17 "},
			{axis:"PM 2.5",value:0.16, day : "Day 17"},
			{axis:"Sulphur oxide",value:0.0028,day : "Day 17"},
			{axis:"Carbon dioxide",value:0.22,day : "Day 17"},
			],	
			
		[
			{axis:"Nitrogen dioxide",value:0.09,day:"Day 18"},
			{axis:"Nitrogen Oxide",value:0.30,day : "Day 18 "},
			{axis:"PM 2.5",value:0.50, day : "Day 18"},
			{axis:"Sulphur oxide",value:0.002,day : "Day 18"},
			{axis:"Carbon dioxide",value:0.55,day : "Day 18"},
			],	
			
		[
			{axis:"Nitrogen dioxide",value:0.09,day:"Day 19"},
			{axis:"Nitrogen Oxide",value:0.43,day : "Day 19 "},
			{axis:"PM 2.5",value:0.08, day : "Day 19"},
			{axis:"Sulphur oxide",value:0.04,day : "Day 19"},
			{axis:"Carbon dioxide",value:0.09,day : "Day 19"},
			],	
		[
			{axis:"Nitrogen dioxide",value:0.74,day:"Day 20"},
			{axis:"Nitrogen Oxide",value:0.019,day : "Day 20 "},
			{axis:"PM 2.5",value:0.54, day : "Day 20"},
			{axis:"Sulphur oxide",value:0.002,day : "Day 20"},
			{axis:"Carbon dioxide",value:0.58,day : "Day 20"},
			],	
		[
			{axis:"Nitrogen dioxide",value:0.52,day:"Day 21"},
			{axis:"Nitrogen Oxide",value:0.08,day : "Day 21 "},
			{axis:"PM 2.5",value:0.41, day : "Day 21"},
			{axis:"Sulphur oxide",value:0.001,day : "Day 21"},
			{axis:"Carbon dioxide",value:0.45,day : "Day 21"},
			],	
		[
			{axis:"Nitrogen dioxide",value:0.34,day:"Day 22"},
			{axis:"Nitrogen Oxide",value:0.35,day : "Day 22 "},
			{axis:"PM 2.5",value:0.29, day : "Day 22"},
			{axis:"Sulphur oxide",value:0.004,day : "Day 22"},
			{axis:"Carbon dioxide",value:0.27,day : "Day 22"},
			],					
		[
			{axis:"Nitrogen dioxide",value:0.28,day:"Day 23"},
			{axis:"Nitrogen Oxide",value:0.23,day : "Day 23 "},
			{axis:"PM 2.5",value:0.17, day : "Day 23"},
			{axis:"Sulphur oxide",value:0.002,day : "Day 23"},
			{axis:"Carbon dioxide",value:0.17,day : "Day 23"},
			],	
		
		[
			{axis:"Nitrogen dioxide",value:0.24,day:"Day 24"},
			{axis:"Nitrogen Oxide",value:0.14,day : "Day 24 "},
			{axis:"PM 2.5",value:0.06, day : "Day 24"},
			{axis:"Sulphur oxide",value:0.0011,day : "Day 24"},
			{axis:"Carbon dioxide",value:0.11,day : "Day 24"},
			],	
		[
			{axis:"Nitrogen dioxide",value:0.19,day:"Day 25"},
			{axis:"Nitrogen Oxide",value:0.03,day : "Day 25 "},
			{axis:"PM 2.5",value:0.08, day : "Day 25"},
			{axis:"Sulphur oxide",value:0.0001,day : "Day 25"},
			{axis:"Carbon dioxide",value:0.15,day : "Day 25"},
			],	
		[
			{axis:"Nitrogen dioxide",value:0.39,day:"Day 26"},
			{axis:"Nitrogen Oxide",value:0.15,day : "Day 26 "},
			{axis:"PM 2.5",value:0.07, day : "Day 26"},
			{axis:"Sulphur oxide",value:0.0035,day : "Day 26"},
			{axis:"Carbon dioxide",value:0.16,day : "Day 26"},
			],	
		[
			{axis:"Nitrogen dioxide",value:0.47,day:"Day 27"},
			{axis:"Nitrogen Oxide",value:0.23,day : "Day 27 "},
			{axis:"PM 2.5",value:0.17, day : "Day 27"},
			{axis:"Sulphur oxide",value:0.001,day : "Day 27"},
			{axis:"Carbon dioxide",value:0.21,day : "Day 27"},
			],
		[
			{axis:"Nitrogen dioxide",value:0.34,day:"Day 28"},
			{axis:"Nitrogen Oxide",value:0.07,day : "Day 28 "},
			{axis:"PM 2.5",value:0.15, day : "Day 28"},
			{axis:"Sulphur oxide",value:0.0012,day : "Day 28"},
			{axis:"Carbon dioxide",value:0.19,day : "Day 28"},
			],
		[
			{axis:"Nitrogen dioxide",value:0.38,day:"Day 29"},
			{axis:"Nitrogen Oxide",value:0.18,day : "Day 29 "},
			{axis:"PM 2.5",value:0.32, day : "Day 29"},
			{axis:"Sulphur oxide",value:0.001,day : "Day 29"},
			{axis:"Carbon dioxide",value:0.32,day : "Day 29"},
			],
		[
			{axis:"Nitrogen dioxide",value:0.43,day:"Day 30"},
			{axis:"Nitrogen Oxide",value:0.50,day : "Day 30 "},
			{axis:"PM 2.5",value:0.32, day : "Day 30"},
			{axis:"Sulphur oxide",value:0.003,day : "Day 29"},
			{axis:"Carbon dioxide",value:0.34,day : "Day 29"},
			],
		[
			{axis:"Nitrogen dioxide",value:0.60,day:"Day 31"},
			{axis:"Nitrogen Oxide",value:0.25
			,day : "Day 31 "},
			{axis:"PM 2.5",value:0.33, day : "Day 31"},
			{axis:"Sulphur oxide",value:0.07,day : "Day 31"},
			{axis:"Carbon dioxide",value:0.16,day : "Day 31"},
			],
		];


