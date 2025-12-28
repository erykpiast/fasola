Let's change the photo import flow such as it immediately adds the recipe in a pending state instead of showing
the form.

The experience should be like this: 

1. User selects the photo to import
2. We display the photo fullscreen
3. Over the photo, closer to the bottom edge, we display a select box for the recipe source
    - it's pre-filled with the last source used if the user added imported some photo in the last 24 hours
    - otherwise it's empty and requires the user to select the source from all the sources used previously for any
      photo 
    - the select box should allow to add a new source
    - we should use the native select box design for the given platform and follow respective UX patterns
    - the select box should follow the exact positioning and sizing of the search box displayed on the recipes list
4. Over the photo, next to the select box, we should display a circular button showing a check mark icon button
    - the button should be positioned and sized exactly as the plus button on the recipes list
    - once clicked, the button should redirect the user to the recipes list
    - the button should display the animation that fills the background with an invert color (light in dark mode and
      dark in light mode) from left to right over five seconds; once that time elapses, user should be redirected to
      the recipes list automatically
    - if user interacts with the recipe source select box before the five seconds, the animation should reset to zero
      and the countdown should stop so the user must confirm the import manually
5. Processing for the imported photo should continue in the background no matter if the recipe import screen or the
   list are displayed
6. We should first add the original photo to the database and mark the entry as processing
    - If the app is closed during the processing, all pending entries should be picked from the earliest and processing
      should continue in the background
    - When the recipe is previewed while processing, instead of a title or tags we should only display source selector
      and the checkmark button (without the progress animation) on the bottom of the screen, and a loader in the middle
7. Once processing of the photo is finished, we should mark the entry as processed and we should replace the original
   photo on the list and in the preview with the processed image
    - THE PROCESSED IMAGE MUST NOT BE TURNED TO THE GRAYSCALE - we should adjust geometry, lightning, and sharpness,
      but keep colors; the grayscale transformation should be still applied in the background before the OCR step, but
      we should discard that image and only save the colored version
    - THIS IS A SIGNIFICANT CHANGE TO THE EXISTING PIPELINE
8. For processed photos, we should add an edit icon in the bottom left corner
    - the button should be in the exact same position and sizing as the add button on the recipes list and the checkmark
      button on the import screen
    - the button should trigger the exact form as we use for importing today (with title, tags and source fields)
    - the inputs should have values with corresponding recipe fields recognized during the processing (title and tags)
      and the source confirmed upon importing
    - the source selector implementation should be reused with the import screen
    - the submit button copy should be changed to "Save changes"
