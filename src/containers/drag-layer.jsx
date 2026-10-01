import {connect} from 'react-redux';
import DragLayer from '../components/drag-layer/drag-layer.jsx';

const mapStateToProps = state => ({
    dragging: state.scratchGui.assetDrag.dragging,
    currentOffset: state.scratchGui.assetDrag.currentOffset,
    img: state.scratchGui.assetDrag.img,
    folderPreview: state.scratchGui.assetDrag.dragType === 'FOLDER' ? state.scratchGui.assetDrag.folderPreview : null
});

export default connect(mapStateToProps)(DragLayer);
