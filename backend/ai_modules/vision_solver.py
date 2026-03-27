import sys
import os
import json
import logging
from ultralytics import YOLO

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger("Vision-YOLO")

class VisionSolver:
    def __init__(self, model_version="yolov8n.pt"):
        # Load a pre-trained YOLOv8 model (downloads automatically if not found)
        self.model = YOLO(model_version)

    def detect_objects(self, image_path: str):
        """Detects objects in the given image using YOLO."""
        if not os.path.exists(image_path):
            return {"success": False, "error": f"Image not found: {image_path}"}
        
        try:
            results = self.model(image_path, verbose=False)
            detections = []
            
            for r in results:
                for box in r.boxes:
                    b = box.xyxy[0].tolist()  # get box coordinates in (top, left, bottom, right) format
                    c = box.cls.item()        # get class id
                    conf = box.conf.item()     # get confidence score
                    detections.append({
                        "box": {"x1": b[0], "y1": b[1], "x2": b[2], "y2": b[3]},
                        "class": r.names[int(c)],
                        "confidence": conf
                    })
            
            return {"success": True, "detections": detections}
        except Exception as e:
            logger.error(f"Detection failed: {str(e)}")
            return {"success": False, "error": str(e)}

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "error": "Usage: python vision_solver.py <image_path>"}))
        sys.exit(1)
        
    image_path = sys.argv[1]
    solver = VisionSolver()
    result = solver.detect_objects(image_path)
    print(json.dumps(result))
    sys.exit(0)
