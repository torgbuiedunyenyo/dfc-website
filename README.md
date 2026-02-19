# Dream Farm Commons Website

Static website for [Dream Farm Commons](https://dreamfarmcommons.com), a contemporary art gallery at 349 15th Street, Oakland CA 94612.

## Project Structure

```
├── index.html          # Redirect to Dfc.html
├── Dfc.html            # Home page
├── About.html          # About page
├── Current.html        # Current exhibitions
├── Future.html         # Upcoming projects
├── Past.html           # Past projects grid (links to projects/)
├── Visit.html          # Visit info
├── Donate.html         # Donation page
├── css/
│   ├── Dfc.css         # Main stylesheet
│   └── reset.css       # CSS reset
├── Images/             # All site images
├── projects/           # Individual exhibition/project pages (~50 pages)
├── script/             # jQuery slides plugin
└── vercel.json         # Vercel deployment config
```

## Development

This is a plain HTML/CSS site with no build step. Open any HTML file in a browser to preview.

**Deployed on Vercel** — pushes to `main` trigger automatic deployment.

## Adding a New Exhibition

1. Create a new HTML file in `projects/` (copy an existing one as a template)
2. Use `../` prefixed paths for shared assets:
   - CSS: `href="../css/Dfc.css"`
   - Images: `src="../Images/YourImage.jpg"`
   - Scripts: `src="../script/jquery.slides.min.js"`
   - Navigation links: `href="../Past.html"`, `href="../Dfc.html"`, etc.
3. Add the project's thumbnail and link to `Past.html` (or `Current.html`)
4. Add images to `Images/`
