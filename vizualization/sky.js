// skybox.js
class Skybox {
    constructor(gl) {
        this.gl = gl;
        
        // Vertex positions for a cube
        const vertices = new Float32Array([
            -1.0,  1.0, -1.0,
            -1.0, -1.0, -1.0,
             1.0, -1.0, -1.0,
             1.0,  1.0, -1.0,
            -1.0, -1.0,  1.0,
            -1.0,  1.0,  1.0,
             1.0, -1.0,  1.0,
             1.0,  1.0,  1.0,
        ]);

        // Indices for drawing the cube
        const indices = new Uint16Array([
            0, 1, 2, 0, 2, 3,  // front
            5, 4, 6, 5, 6, 7,  // back
            3, 2, 6, 3, 6, 7,  // right
            0, 1, 4, 0, 4, 5,  // left
            0, 3, 7, 0, 7, 5,  // top
            1, 2, 6, 1, 6, 4   // bottom
        ]);

        // Create and bind vertex buffer
        this.vertexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

        // Create and bind index buffer
        this.indexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

        // Create shader program
        this.program = this.createShaderProgram();
        
        // Get attribute and uniform locations
        this.positionAttrib = gl.getAttribLocation(this.program, 'aPosition');
        this.viewProjectionUniform = gl.getUniformLocation(this.program, 'uViewProjection');
        this.skyboxUniform = gl.getUniformLocation(this.program, 'uSkybox');

        // Create texture
        this.texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_CUBE_MAP, this.texture);

        // Set texture parameters
        gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
    }

    // Vertex shader for equirectangular to cubemap conversion
    get vertexShaderSource() {
        return `#version 300 es
            in vec3 aPosition;
            uniform mat4 uViewProjection;
            out vec3 vTexCoord;
            
            void main() {
                vTexCoord = aPosition;
                vec4 pos = uViewProjection * vec4(aPosition, 1.0);
                gl_Position = pos.xyww;
            }`;
    }

    // Fragment shader for equirectangular to cubemap conversion
    get fragmentShaderSource() {
        return `#version 300 es
            precision highp float;
            in vec3 vTexCoord;
            uniform sampler2D uSkybox;
            out vec4 fragColor;
            
            const vec2 invAtan = vec2(0.1591, 0.3183);
            
            vec2 SampleSphericalMap(vec3 v) {
                vec2 uv = vec2(atan(v.z, v.x), asin(v.y));
                uv *= invAtan;
                uv += 0.5;
                return uv;
            }
            
            void main() {
                vec3 v = normalize(vTexCoord);
                vec2 uv = SampleSphericalMap(v);
                fragColor = texture(uSkybox, uv);
            }`;
    }

    createShaderProgram() {
        const gl = this.gl;
        const vertexShader = gl.createShader(gl.VERTEX_SHADER);
        const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
        
        gl.shaderSource(vertexShader, this.vertexShaderSource);
        gl.shaderSource(fragmentShader, this.fragmentShaderSource);
        
        gl.compileShader(vertexShader);
        gl.compileShader(fragmentShader);
        
        // Check for shader compilation errors
        if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
            console.error('Vertex shader compilation error:', gl.getShaderInfoLog(vertexShader));
        }
        if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
            console.error('Fragment shader compilation error:', gl.getShaderInfoLog(fragmentShader));
        }
        
        const program = gl.createProgram();
        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);
        
        return program;
    }

    loadTexture(imagePath) {
        const gl = this.gl;
        const image = new Image();
        image.crossOrigin = "anonymous";
        
        image.onload = () => {
            gl.bindTexture(gl.TEXTURE_2D, this.texture);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
            gl.generateMipmap(gl.TEXTURE_2D);
        };
        
        image.src = imagePath;
    }

    render(viewProjectionMatrix) {
        const gl = this.gl;
        
        gl.useProgram(this.program);
        
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
        gl.enableVertexAttribArray(this.positionAttrib);
        gl.vertexAttribPointer(this.positionAttrib, 3, gl.FLOAT, false, 0, 0);
        
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
        
        gl.uniformMatrix4fv(this.viewProjectionUniform, false, viewProjectionMatrix);
        
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.uniform1i(this.skyboxUniform, 0);
        
        gl.depthFunc(gl.LEQUAL);
        gl.drawElements(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0);
        gl.depthFunc(gl.LESS);
    }
}