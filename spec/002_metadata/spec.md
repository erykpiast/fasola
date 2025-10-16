Extend application functionality so every imported photo can be enhanced with metadata:

 * recipe name - a string, used as a title
 * source - a string, such as an URL to a website, or the name of a book
 * tags - list of strings (no spaces, always starts with `#`)

Metadata form should appear after selecting the photo to import. It should display the imported photo full width, cropped to a square, and fields below. All fields should be optional. At the very bottom, there should be a CTA button "Add recipe". There should be a (x) close/cancel button on the top right corner of the photo, fixed (so when the user scrolls, it's still there).

It also should be possible to add metadata to already imported photos and edit already provided metadata.

The recipe view should be displayed after clicking on the photo on the gallery list.

The recipe view should display the photo full-width, cropped to square on the top.

The title should be displayed on an overlay over the photo. The overlay should be a gradient - full transparency on the top, black 50% transparency on the bottom. Then, the title with bright font on the bottom.

Tags should be displayed under the photo, separated by spaces.

Source should be displayed at the bottom. If the source starts with `http(s)://`, we should render a link to the source with a globe icon and the hostname. Otherwise, we should render a book icon and the source value as-is.

There should be a pencil menu that activates edit mode, position in the top-right of the photo (sticky, same as the close button). It should change the view to exactly the same as the import form but populated with the current values. The button on the bottom should say "Save changes". The (x) button should cancel edits.

The solution architecture should promote composition over configuration. E.g. we should define reusable components to build the form, but then have two form instances for the add end edit form, so we can change how buttons work or how form state is populated.

For the metadata saving, we should consider some kind of lightweight database behind some abstraction, so it can be replaced with a remote storage with advanced capabilities as the application evolves. For now, we can store the data locally on device.