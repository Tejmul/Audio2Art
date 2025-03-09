let speechRecognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
let recordButton = document.getElementById("recordButton");
let audioFileInput = document.getElementById("audioFile");
let generateButton = document.getElementById("generateButton");
let imageDisplay = document.getElementById("generatedImage");
let textOutput = document.createElement("p");

// Add some styling to make the text output more visible
textOutput.style.margin = "15px 0";
textOutput.style.padding = "10px";
textOutput.style.border = "1px solid #ccc";
textOutput.style.borderRadius = "5px";
textOutput.style.backgroundColor = "#f9f9f9";
textOutput.textContent = "Your voice description will appear here...";

document.querySelector(".main").appendChild(textOutput);

// API keys - replace with your actual keys
const ASSEMBLYAI_API_KEY = "815e867c96944344a57e0db95d543b7f"; 
const HUGGINGFACE_API_TOKEN = "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";

// 🎤 Browser Speech Recognition with better error handling
speechRecognition.continuous = false;
speechRecognition.interimResults = false;
speechRecognition.lang = 'en-US';

speechRecognition.onresult = (event) => {
    let transcript = event.results[0][0].transcript;
    textOutput.textContent = transcript;
    console.log("Transcript: ", transcript);
};

speechRecognition.onerror = (event) => {
    console.error("Speech recognition error", event.error);
    textOutput.textContent = "Error: " + event.error;
};

speechRecognition.onend = () => {
    recordButton.disabled = false;
    recordButton.textContent = "🎤 Record";
};

// Start Recording with better UX
recordButton.onclick = () => {
    try {
        speechRecognition.start();
        textOutput.textContent = "Listening...";
        recordButton.disabled = true;
        recordButton.textContent = "🎤 Recording...";
        console.log("Speech recognition started");
    } catch (error) {
        console.error("Failed to start speech recognition:", error);
        textOutput.textContent = "Failed to start speech recognition. Please try again.";
        recordButton.disabled = false;
    }
};

// 📂 Audio File Upload to AssemblyAI
audioFileInput.onchange = async (event) => {
    let file = event.target.files[0];
    if (!file) return;

    textOutput.textContent = "Processing audio file...";
    recordButton.disabled = true;
    generateButton.disabled = true;

    try {
        // 🔹 Step 1: Upload Audio File
        console.log("Uploading file to AssemblyAI...");
        let uploadResponse = await fetch("https://api.assemblyai.com/v2/upload", {
            method: "POST",
            headers: { 
                "Authorization": ASSEMBLYAI_API_KEY 
            },
            body: file
        });

        let uploadData = await uploadResponse.json();
        console.log("Upload response:", uploadData);
        
        if (!uploadData.upload_url) throw new Error("Upload failed");

        let audioUrl = uploadData.upload_url;

        // 🔹 Step 2: Request Transcription
        console.log("Requesting transcription...");
        let transcribeResponse = await fetch("https://api.assemblyai.com/v2/transcript", {
            method: "POST",
            headers: {
                "Authorization": ASSEMBLYAI_API_KEY,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ audio_url: audioUrl }),
        });

        let transcribeData = await transcribeResponse.json();
        console.log("Transcription request response:", transcribeData);
        
        let transcriptId = transcribeData.id;
        if (!transcriptId) throw new Error("Failed to get transcription ID");

        // 🔹 Step 3: Poll for Transcription Result
        console.log("Polling for transcription results...");
        let transcript = await pollTranscription(transcriptId);
        textOutput.textContent = transcript || "No transcription found.";
        console.log("Final transcript:", transcript);

    } catch (error) {
        console.error("Error transcribing audio:", error);
        textOutput.textContent = "Error transcribing audio: " + error.message;
    } finally {
        recordButton.disabled = false;
        generateButton.disabled = false;
    }
};

// 🔄 Polling Function for Transcription Status
async function pollTranscription(id) {
    const url = `https://api.assemblyai.com/v2/transcript/${id}`;
    const headers = { "Authorization": ASSEMBLYAI_API_KEY };

    for (let i = 0; i < 30; i++) { // Increased to 30 iterations for longer files
        console.log(`Polling attempt ${i+1}/30...`);
        let response = await fetch(url, { headers });
        let data = await response.json();
        console.log("Polling response:", data);

        if (data.status === "completed") {
            return data.text;
        } else if (data.status === "failed") {
            throw new Error("Transcription failed: " + (data.error || "Unknown error"));
        } else if (data.status === "processing") {
            console.log("Transcription still processing...");
        }

        // Wait longer between polls to avoid rate limiting
        await new Promise(res => setTimeout(res, 2000));
    }
    throw new Error("Transcription timed out after multiple attempts.");
}

// 🎨 Generate Art from Transcribed Text using Hugging Face API
generateButton.onclick = async () => {
    let prompt = textOutput.textContent;
    if (!prompt || 
        prompt === "Listening..." || 
        prompt === "Your voice description will appear here..." ||
        prompt.includes("Error") || 
        prompt.includes("Processing")) {
        alert("Please record or upload an audio file first!");
        return;
    }

    // Disable buttons during generation
    generateButton.disabled = true;
    recordButton.disabled = true;
    
    textOutput.textContent = "Generating art from: " + prompt;
    
    // Show loading state
    imageDisplay.src = "";
    imageDisplay.alt = "Generating your art...";
    imageDisplay.style.display = "block";

    try {
        console.log("Sending request to Hugging Face with prompt:", prompt);
        
        // Using Stable Diffusion model from Hugging Face
        const response = await fetch(
            "https://api-inference.huggingface.co/models/runwayml/stable-diffusion-v1-5",
            {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${HUGGINGFACE_API_TOKEN}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ 
                    inputs: prompt,
                    parameters: {
                        num_inference_steps: 30,  // More steps = better quality but slower
                        guidance_scale: 7.5      // How closely to follow the prompt
                    }
                })
            }
        );

        console.log("Response status:", response.status);
        
        // Check if the response is an image
        if (!response.ok) {
            const errorData = await response.json();
            console.error("HF API error data:", errorData);
            throw new Error(errorData.error || `API error: ${response.status}`);
        }

        // Get the image data
        const imageBlob = await response.blob();
        const imageUrl = URL.createObjectURL(imageBlob);
        
        console.log("Image generated successfully");
        
        // Display the image
        imageDisplay.src = imageUrl;
        imageDisplay.alt = "Generated art based on audio";
        imageDisplay.style.display = "block";
        
        // Update text to show success
        textOutput.textContent = `Art generated from: "${prompt}"`;

    } catch (error) {
        console.error("Error generating image:", error);
        textOutput.textContent = "Error generating image: " + error.message;
        alert("Failed to generate art: " + error.message);
    } finally {
        // Re-enable buttons
        generateButton.disabled = false;
        recordButton.disabled = false;
    }
};

// Add event listeners for the page load
window.addEventListener('DOMContentLoaded', () => {
    console.log("Audio2Art app initialized");
    // Add default placeholder image or message
    imageDisplay.style.display = "none";
});