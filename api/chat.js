export default async function handler(req, res) {
  // Ruhusu njia ya POST pekee (maombi ya kutuma ujumbe)
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Njia hairuhusiwi' });
  }

  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Tafadhali weka ujumbe' });
    }

    // Kuchukua API Key kutoka kwenye Secrets uliyohifadhi
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: 'API Key haijapatikana' });
    }

    // Kutuma ujumbe kwenda kwa Gemini API
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: message }],
            },
          ],
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data.error?.message || 'Kuna tatizo limetokea' });
    }

    // Kuchukua jibu la Gemini
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Sikuweza kupata jibu.';

    // Kumrudishia mtumiaji jibu
    return res.status(200).json({ reply });
  } catch (error) {
    return res.status(500).json({ error: 'Kuna tatizo kwenye mfumo: ' + error.message });
  }
}
