We want to save low-res thumbnails along the recipe full photo to enable faster rendering of the images list. Today the list renders really slow, especially when it's long (100+ recipes). 

Potentially, it's an opportunity to introduce virtualised list solution, too?

We need to keep the thumbnail synchronised with original/processed image - so once the image geometry and lightning is corrected - we should re-generate the thumbnail. Thumbnails should be stored alongside the main image and synchronised via iCloud documents.
