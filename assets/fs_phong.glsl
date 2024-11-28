#version 300 es
precision highp float;

in vec3 v_normal;
in vec3 v_cameraDirection;
in vec3 v_lightDirection;
in vec3 v_worldPosition;
in vec4 v_ambientColor;
in vec4 v_diffuseColor;
in vec4 v_specularColor;
in vec4 v_emissiveColor;
in float v_shininess;

uniform vec4 u_ambientLight;
uniform vec4 u_diffuseLight;
uniform vec4 u_specularLight;
uniform float u_emissiveFactor;
uniform vec3 u_lightWorldPosition;
uniform vec3 u_sphereLightPositions[10];
uniform vec4 u_sphereLightColors[10];
uniform int u_numSphereLights;

out vec4 outColor;

vec4 calculateLightContribution(vec3 lightPos, vec4 lightColor, bool isSphereLight) {
    vec3 normalVector = normalize(v_normal);
    vec3 lightVector = normalize(lightPos - v_worldPosition);
    float distance = length(lightPos - v_worldPosition);
    
    // Strong distance attenuation for sphere lights
    float attenuation = 1.0;
    if(isSphereLight) {
        // Adjust these values to control light reach
        float maxDistance = 3.0; // Maximum effective distance of sphere lights
        attenuation = max(0.0, 1.0 - (distance / maxDistance));
        attenuation = attenuation * attenuation; // Square for faster falloff
    }
    
    float lambert = dot(normalVector, lightVector);
    vec4 diffuse = vec4(0,0,0,1);
    vec4 specular = vec4(0,0,0,1);
    
    if(lambert > 0.0) {
        diffuse = lightColor * v_diffuseColor * lambert * attenuation;
        
        vec3 camera_v = normalize(v_cameraDirection);
        vec3 parallel_v = normalVector * lambert;
        vec3 perpendicular_v = lightVector - parallel_v;
        vec3 reflect_v = parallel_v - perpendicular_v;
        
        float spec = pow(max(dot(camera_v, reflect_v), 0.0), v_shininess);
        if(spec > 0.0) {
            specular = v_specularColor * u_specularLight * spec * attenuation;
        }
    }
    
    return diffuse + specular;
}

void main() {
    // Main light contribution (no local attenuation)
    vec4 mainLightContrib = calculateLightContribution(u_lightWorldPosition, u_diffuseLight, false);
    
    // Sphere lights contribution (with local attenuation)
    vec4 sphereLightsContrib = vec4(0);
    for(int i = 0; i < u_numSphereLights; i++) {
        sphereLightsContrib += calculateLightContribution(u_sphereLightPositions[i], u_sphereLightColors[i], true);
    }
    
    vec4 ambient = u_ambientLight * v_ambientColor;
    vec4 emission = v_emissiveColor * u_emissiveFactor;
    
    outColor = ambient + mainLightContrib + sphereLightsContrib + emission;
}